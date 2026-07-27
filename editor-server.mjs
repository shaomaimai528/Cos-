import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(root, 'public')
const statePath = path.join(publicDir, 'editor-content.json')
const settingsPath = path.join(root, '.editor-settings.json')
const backupDir = path.join(root, 'website-backups')
const apiPort = Number.parseInt(process.env.EDITOR_API_PORT || '4399', 10)
const vitePort = Number.parseInt(process.env.EDITOR_VITE_PORT || '5173', 10)
const defaultSettings = {
  githubRepo: '',
  branch: 'main',
  vercelSiteUrl: '',
}

const defaultState = {
  version: 1,
  overrides: {},
  insertions: [],
  pages: [],
}

const publishProgress = {
  running: false,
  stage: 'idle',
  currentStep: 0,
  totalSteps: 5,
  message: '等待发布',
  detail: '',
  errorStep: 0,
  updatedAt: Date.now(),
}

function updatePublishProgress(next) {
  Object.assign(publishProgress, next, { updatedAt: Date.now() })
}

async function ensureState() {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'))
  } catch {
    await fs.mkdir(publicDir, { recursive: true })
    await fs.writeFile(statePath, JSON.stringify(defaultState, null, 2), 'utf8')
    return defaultState
  }
}

async function readSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(await fs.readFile(settingsPath, 'utf8')) }
  } catch {
    return { ...defaultSettings }
  }
}

async function writeSettings(next) {
  const settings = {
    githubRepo: String(next.githubRepo || '').trim(),
    branch: String(next.branch || 'main').trim() || 'main',
    vercelSiteUrl: String(next.vercelSiteUrl || '').trim().replace(/\/$/, ''),
  }
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
  return settings
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  response.end(JSON.stringify(payload))
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 300 * 1024 * 1024) throw new Error('文件超过 300MB，请先压缩后再上传')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readJson(request) {
  const raw = await readBody(request)
  return raw ? JSON.parse(raw) : {}
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function safeFileName(name) {
  const cleaned = String(name || 'image').replace(/[^a-zA-Z0-9._-]/g, '-')
  return cleaned || 'image'
}

async function copyProjectToBackup() {
  const target = path.join(backupDir, `visual-editor-${timestamp()}`)
  const staging = path.join(path.dirname(root), `.visual-editor-staging-${timestamp()}`)
  try {
    await fs.cp(root, staging, {
      recursive: true,
      filter(source) {
        const relative = path.relative(root, source)
        if (!relative) return true
        const first = relative.split(path.sep)[0]
        return !['node_modules', 'dist', '.git', 'website-backups'].includes(first)
      },
    })
    await fs.mkdir(backupDir, { recursive: true })
    await fs.rename(staging, target)
    return target
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 180000 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve({ stdout, stderr })
    })
  })
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function commandOutput(error) {
  return `${error.stdout || ''}\n${error.stderr || error.message || ''}`.trim()
}

function isTransientGitNetworkError(error) {
  const output = commandOutput(error).toLowerCase()
  return [
    'connection was reset',
    'recv failure',
    'could not resolve host',
    'failed to connect',
    'connection timed out',
    'operation timed out',
    'the requested url returned error: 5',
    'curl 5',
    'curl 6',
    'curl 7',
    'curl 28',
    'early eof',
    'remote end hung up',
  ].some((marker) => output.includes(marker))
}

async function runGitNetwork(args, operation) {
  const variants = [
    { args: ['-c', 'http.version=HTTP/1.1', ...args], label: 'HTTP/1.1 connection' },
    { args, label: 'default connection' },
  ]
  let lastError
  for (let attempt = 0; attempt < variants.length; attempt += 1) {
    const variant = variants[attempt]
    try {
      return { ...(await run('git', variant.args)), connectionMode: variant.label }
    } catch (error) {
      lastError = error
      if (!isTransientGitNetworkError(error) || attempt === variants.length - 1) break
      await sleep(1200)
    }
  }
  const detail = commandOutput(lastError)
  throw Object.assign(new Error(`${operation} failed. GitHub network connection was not available.\n${detail}`), {
    stdout: lastError?.stdout || '',
    stderr: lastError?.stderr || detail,
    cause: lastError,
  })
}

async function pushAndVerify(branch, expectedCommit, beforeVerification) {
  const push = await runGitNetwork(['push', '-u', 'origin', branch], 'GitHub upload')
  beforeVerification?.()
  const remote = await runGitNetwork(['ls-remote', 'origin', `refs/heads/${branch}`], 'GitHub upload verification')
  const remoteCommit = remote.stdout.trim().split(/\s+/)[0] || ''
  if (remoteCommit.toLowerCase() !== expectedCommit.toLowerCase()) {
    throw Object.assign(new Error(`GitHub upload could not be verified. Local commit ${expectedCommit}, remote commit ${remoteCommit || 'missing'}.`), {
      stdout: `${push.stdout || ''}\n${remote.stdout || ''}`,
      stderr: remote.stderr || '',
    })
  }
  return { push, remoteCommit }
}

function openExternal(url) {
  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const child = spawn(command, [url], { detached: true, stdio: 'ignore' })
  child.unref()
}

async function readDeploymentInfo(vercelSiteUrl) {
  if (!vercelSiteUrl) throw new Error('尚未填写 Vercel 网站地址')
  const url = `${vercelSiteUrl}/deployment-info.json?check=${Date.now()}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`线上版本标记返回 HTTP ${response.status}`)
    return await response.json()
  } catch (nodeError) {
    if (process.platform !== 'win32') throw nodeError
    const script = `$response = Invoke-WebRequest -UseBasicParsing -Uri '${url}' -TimeoutSec 20; [Console]::Out.Write($response.Content)`
    const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    try {
      return JSON.parse(result.stdout)
    } catch {
      throw nodeError
    }
  }
}

async function waitForDeployment(vercelSiteUrl, commit, timeoutMilliseconds = 30000) {
  if (!vercelSiteUrl) {
    return { status: 'not-configured', message: 'Vercel site URL is not configured', commit, url: '' }
  }
  const deadline = Date.now() + timeoutMilliseconds
  let deployedCommit = ''
  let detail = ''
  while (Date.now() < deadline) {
    try {
      const deployed = await readDeploymentInfo(vercelSiteUrl)
      deployedCommit = String(deployed.commit || '')
      if (deployedCommit.toLowerCase() === commit.toLowerCase()) {
        return { status: 'success', message: 'Vercel deployment verified', commit, deployedCommit, url: vercelSiteUrl }
      }
      detail = deployedCommit ? `Vercel is still serving commit ${deployedCommit}.` : 'Vercel deployment is still in progress.'
    } catch (error) {
      detail = error.message || String(error)
    }
    await sleep(2500)
  }
  return { status: 'pending', message: 'GitHub upload succeeded; Vercel deployment is still pending or could not be verified.', commit, deployedCommit, detail, url: vercelSiteUrl }
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${vitePort}/editor`)
      if (response.ok) return true
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function handleApi(request, response, url) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    })
    response.end()
    return true
  }

  if (url.pathname === '/api/editor/settings' && request.method === 'GET') {
    sendJson(response, 200, await readSettings())
    return true
  }

  if (url.pathname === '/api/editor/publish-status' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, progress: { ...publishProgress } })
    return true
  }

  if (url.pathname === '/api/editor/settings' && request.method === 'POST') {
    sendJson(response, 200, { ok: true, settings: await writeSettings(await readJson(request)) })
    return true
  }

  if (url.pathname === '/api/editor/connect-github' && request.method === 'POST') {
    try {
      const settings = await writeSettings(await readJson(request))
      if (!settings.githubRepo) throw new Error('请先填写 GitHub 仓库地址')
      try { await run('git', ['rev-parse', '--git-dir']) } catch { await run('git', ['init']) }
      await run('git', ['branch', '-M', settings.branch])
      try { await run('git', ['remote', 'set-url', 'origin', settings.githubRepo]) }
      catch { await run('git', ['remote', 'add', 'origin', settings.githubRepo]) }
      const remote = await run('git', ['remote', '-v'])
      sendJson(response, 200, { ok: true, output: remote.stdout, settings })
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.stderr || error.message })
    }
    return true
  }

  if (url.pathname === '/api/editor/auth-status' && request.method === 'GET') {
    const settings = await readSettings()
    let githubLoggedIn = false
    let githubAccount = ''
    try {
      const accounts = await run('git', ['credential-manager', 'github', 'list'])
      githubAccount = accounts.stdout.trim().split(/\r?\n/).filter(Boolean)[0] || ''
      githubLoggedIn = Boolean(githubAccount)
    } catch {
      githubLoggedIn = false
    }
    sendJson(response, 200, {
      ok: true,
      github: { loggedIn: githubLoggedIn, account: githubAccount, connected: Boolean(settings.githubRepo) },
      vercel: { connected: Boolean(settings.vercelSiteUrl), url: settings.vercelSiteUrl },
    })
    return true
  }

  if (url.pathname === '/api/editor/login-github' && request.method === 'POST') {
    try {
      await run('git', ['config', '--global', 'credential.helper', 'manager'])
      const child = spawn('git', ['credential-manager', 'github', 'login'], { detached: true, stdio: 'ignore', windowsHide: false })
      child.unref()
      sendJson(response, 200, { ok: true, message: 'GitHub 官方登录窗口已打开。完成一次登录后，系统会记住授权。' })
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.stderr || error.message })
    }
    return true
  }

  if (url.pathname === '/api/editor/open-vercel' && request.method === 'POST') {
    openExternal('https://vercel.com/new')
    sendJson(response, 200, { ok: true, message: 'Vercel 官方导入页面已打开。请选择 GitHub 仓库并部署一次。' })
    return true
  }

  if (url.pathname === '/api/editor/state' && request.method === 'GET') {
    sendJson(response, 200, await ensureState())
    return true
  }

  if (url.pathname === '/api/editor/state' && request.method === 'POST') {
    const next = await readJson(request)
    const state = {
      version: 1,
      overrides: next.overrides ?? {},
      insertions: Array.isArray(next.insertions) ? next.insertions : [],
      pages: Array.isArray(next.pages) ? next.pages : [],
    }
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
    sendJson(response, 200, { ok: true, state })
    return true
  }

  if (url.pathname === '/api/editor/upload' && request.method === 'POST') {
    const body = await readJson(request)
    const match = String(body.data || '').match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      sendJson(response, 400, { ok: false, message: '图片数据格式不正确' })
      return true
    }
    const mime = match[1]
    const sourceBuffer = Buffer.from(match[2], 'base64')
    const extension = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').replace('mpeg', 'mp3')
    const requested = safeFileName(body.name || `uploaded-${Date.now()}.${extension}`)
    const sourceBaseName = path.parse(requested).name || `uploaded-${Date.now()}`
    const fileName = mime.startsWith('image/') ? `${sourceBaseName}.webp` : requested.includes('.') ? requested : `${requested}.${extension}`
    const mediaFolder = mime.startsWith('video/') ? 'videos' : mime.startsWith('audio/') ? 'audio' : 'images'
    const relativeDir = path.join(mediaFolder, 'editor')
    const targetDir = path.join(publicDir, relativeDir)
    await fs.mkdir(targetDir, { recursive: true })
    let outputBuffer = sourceBuffer
    let width
    let height
    if (mime.startsWith('image/')) {
      const optimized = sharp(sourceBuffer, { animated: true }).rotate().resize({
        width: 2560,
        height: 2560,
        fit: 'inside',
        withoutEnlargement: true,
      }).webp({ quality: 86, effort: 5, smartSubsample: true })
      outputBuffer = await optimized.toBuffer()
      const metadata = await sharp(outputBuffer).metadata()
      width = metadata.width
      height = metadata.height
    }
    await fs.writeFile(path.join(targetDir, fileName), outputBuffer)
    sendJson(response, 200, {
      ok: true,
      src: `/${relativeDir.replaceAll(path.sep, '/')}/${fileName}`,
      format: mime.startsWith('image/') ? 'webp' : extension,
      originalBytes: sourceBuffer.length,
      optimizedBytes: outputBuffer.length,
      width,
      height,
    })
    return true
  }

  if (url.pathname === '/api/editor/backup' && request.method === 'POST') {
    const target = await copyProjectToBackup()
    sendJson(response, 200, { ok: true, path: target })
    return true
  }

  if (url.pathname === '/api/editor/build' && request.method === 'POST') {
    try {
      const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
      const args = process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm.cmd run build']
        : ['run', 'build']
      const result = await run(command, args)
      sendJson(response, 200, { ok: true, output: `${result.stdout}\n${result.stderr}` })
    } catch (error) {
      sendJson(response, 500, { ok: false, output: `${error.stdout || ''}\n${error.stderr || error.message}` })
    }
    return true
  }

  if (url.pathname === '/api/editor/project' && request.method === 'GET') {
    try {
      const status = await run('git', ['status', '--short', '--branch'])
      const settings = await readSettings()
      sendJson(response, 200, { ok: true, status: status.stdout, settings })
    } catch (error) {
      sendJson(response, 200, { ok: true, status: '尚未连接 GitHub 仓库', settings: await readSettings() })
    }
    return true
  }

  if (url.pathname === '/api/editor/deployment-status' && request.method === 'GET') {
    const commit = url.searchParams.get('commit') || ''
    if (!commit) {
      sendJson(response, 400, { ok: false, message: '缺少要检查的提交编号' })
      return true
    }
    try {
      const settings = await readSettings()
      const deployed = await readDeploymentInfo(settings.vercelSiteUrl)
      const matched = deployed.commit === commit
      sendJson(response, 200, {
        ok: true,
        status: matched ? 'success' : 'pending',
        message: matched ? 'Vercel 已部署完成' : 'Vercel 正在部署，线上版本尚未切换',
        commit,
        deployedCommit: deployed.commit || '',
        url: settings.vercelSiteUrl,
      })
    } catch (error) {
      sendJson(response, 200, {
        ok: true,
        status: 'pending',
        message: 'Vercel 已触发部署，暂时无法读取线上版本标记',
        commit,
        url: (await readSettings()).vercelSiteUrl,
        detail: error.message,
      })
    }
    return true
  }

  if (url.pathname === '/api/editor/publish' && request.method === 'POST') {
    if (publishProgress.running) {
      sendJson(response, 409, { ok: false, message: '已有一个发布任务正在进行，请等待它完成。', progress: { ...publishProgress } })
      return true
    }
    updatePublishProgress({ running: true, stage: 'build', currentStep: 1, message: '正在检查并构建网站', detail: '正在确认网站可以正常生成线上文件。', errorStep: 0 })
    try {
      const settings = await readSettings()
      if (!settings.githubRepo) throw new Error('尚未连接 GitHub 仓库，请先完成首次设置')
      updatePublishProgress({ stage: 'build', currentStep: 1, message: '正在检查 GitHub 连接并构建网站', detail: '先确认当前仓库可以上传，再开始生成线上文件。' })
      await runGitNetwork(['push', '--dry-run', '-u', 'origin', settings.branch], 'GitHub connection check')
      const buildCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
      const buildArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build']
      await run(buildCommand, buildArgs)
      updatePublishProgress({ stage: 'commit', currentStep: 2, message: '网站检查通过，正在整理本地修改', detail: '正在生成本次发布提交。' })
      await run('git', ['add', '-A'])
      let commitOutput = ''
      try {
        const commit = await run('git', ['commit', '-m', 'Update website from visual editor'])
        commitOutput = commit.stdout
      } catch (error) {
        if (!String(error.stdout || '').includes('nothing to commit') && !String(error.stderr || '').includes('nothing to commit')) throw error
        commitOutput = '没有新的文件需要提交。'
      }
      const commitSha = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim()
      updatePublishProgress({ stage: 'github-upload', currentStep: 3, message: '正在上传到 GitHub', detail: '正在使用兼容网络连接上传代码。' })
      const pushed = await pushAndVerify(settings.branch, commitSha, () => updatePublishProgress({ stage: 'github-verify', currentStep: 4, message: 'GitHub 上传完成，正在核对远程版本', detail: '正在确认远程分支已经指向本次提交。' }))
      updatePublishProgress({ stage: 'vercel-verify', currentStep: 5, message: 'GitHub 已确认，正在等待 Vercel 部署', detail: 'Vercel 会根据 GitHub 更新自动开始部署。' })
      const vercel = await waitForDeployment(settings.vercelSiteUrl, commitSha)
      updatePublishProgress({ running: false, stage: vercel.status === 'success' ? 'success' : 'pending', currentStep: 5, message: vercel.status === 'success' ? 'GitHub 上传成功，Vercel 部署已确认' : 'GitHub 上传成功，Vercel 仍在部署或暂未确认', detail: vercel.message })
      sendJson(response, 200, {
        ok: true,
        output: [
          commitOutput,
          pushed.push.stdout,
          `GitHub upload verified at ${pushed.remoteCommit}.`,
          vercel.message,
        ].filter(Boolean).join('\n'),
        github: { status: 'success', message: 'GitHub upload verified', commit: commitSha, remoteCommit: pushed.remoteCommit },
        vercel,
        progress: { ...publishProgress },
      })
    } catch (error) {
      const output = commandOutput(error)
      const errorStep = publishProgress.currentStep || 1
      updatePublishProgress({ running: false, stage: 'error', errorStep, message: '发布失败', detail: output })
      sendJson(response, 502, {
        ok: false,
        message: `发布失败：${publishProgress.message}。GitHub 上传未确认，因此没有触发 Vercel。`,
        output,
        github: { status: 'error', message: 'GitHub upload was not confirmed' },
        vercel: { status: 'not-triggered', message: 'Vercel was not triggered because GitHub upload failed.' },
        progress: { ...publishProgress },
      })
    }
    return true
  }

  return false
}

const apiServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    const handled = await handleApi(request, response, url)
    if (!handled) sendJson(response, 404, { ok: false, message: '没有找到本地编辑器接口' })
  } catch (error) {
    sendJson(response, 500, { ok: false, message: error.message || '本地编辑器发生错误' })
  }
})

await ensureState()
apiServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[本地编辑器] 端口 ${apiPort} 已被占用。`)
    console.error('[本地编辑器] 可能已经有一个后台管理软件窗口在运行，请先关闭旧窗口，再重新双击“打开后台管理软件”。')
  } else {
    console.error(`[本地编辑器] 启动失败：${error.message}`)
  }
  process.exit(1)
})
apiServer.listen(apiPort, '127.0.0.1', () => {
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  })

  const openPromise = waitForPreview().then((ready) => {
    if (!ready || process.platform !== 'win32') return
    const opener = spawn('cmd.exe', ['/c', 'start', '', `http://127.0.0.1:${vitePort}/editor`], { detached: true, stdio: 'ignore', windowsHide: true })
    opener.unref()
  })

  const stop = () => {
    void openPromise
    vite.kill()
    apiServer.close(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  vite.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
  })
})
