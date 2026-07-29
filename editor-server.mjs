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
const deploymentFailureLogPath = path.join(root, 'deployment-failures.log')
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
  gallerySections: [],
}

const publishProgress = {
  running: false,
  stage: 'idle',
  currentStep: 0,
  totalSteps: 5,
  message: '等待发布',
  detail: '',
  errorStep: 0,
  commit: '',
  url: '',
  deployedCommit: '',
  startedAt: 0,
  lastCheckedAt: 0,
  checkCount: 0,
  elapsedSeconds: 0,
  updatedAt: Date.now(),
}

let deploymentMonitorCommit = ''

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

function editorImagePath(src) {
  if (typeof src !== 'string' || !src.startsWith('/images/editor/')) return null
  const relative = src.slice(1).replaceAll('/', path.sep)
  const target = path.resolve(publicDir, relative)
  const editorDir = path.resolve(publicDir, 'images', 'editor') + path.sep
  return target.startsWith(editorDir) ? target : null
}

async function cleanupRemovedInsertionFiles(previous, next) {
  const nextReferenced = new Set()
  const addReferencedImage = (src) => {
    const target = editorImagePath(src)
    if (target) nextReferenced.add(target)
  }
  for (const item of next.insertions || []) {
    addReferencedImage(item.src)
    addReferencedImage(item.srcMobile)
  }
  for (const override of Object.values(next.overrides || {})) {
    addReferencedImage(override?.src)
    addReferencedImage(override?.srcMobile)
  }
  const nextIds = new Set((next.insertions || []).map((item) => item.id))
  const removed = (previous.insertions || []).filter((item) => !nextIds.has(item.id))
  await Promise.all(removed.map(async (item) => {
    const targets = [editorImagePath(item.src), editorImagePath(item.srcMobile)].filter(Boolean)
    await Promise.all(targets.map(async (target) => {
      if (!target || nextReferenced.has(target)) return
      await fs.unlink(target).catch(() => {})
    }))
  }))
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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: options.timeout ?? 180000 }, (error, stdout, stderr) => {
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

function parseGitProxy(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed || /^direct$/i.test(trimmed)) return ''
  const mapped = trimmed.match(/(?:^|;)https?=([^;]+)/i)?.[1] || trimmed.split(';')[0]
  if (!mapped) return ''
  return /^https?:\/\//i.test(mapped) ? mapped : `http://${mapped}`
}

async function readSystemGitProxy() {
  const environmentProxy = parseGitProxy(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy)
  if (environmentProxy) return environmentProxy
  if (process.platform !== 'win32') return ''
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
    const [enabledResult, serverResult] = await Promise.all([
      run('reg.exe', ['query', key, '/v', 'ProxyEnable'], { timeout: 5000 }),
      run('reg.exe', ['query', key, '/v', 'ProxyServer'], { timeout: 5000 }),
    ])
    if (!/REG_DWORD\s+0x1/i.test(enabledResult.stdout)) return ''
    const server = serverResult.stdout.match(/ProxyServer\s+REG_SZ\s+(.+)/i)?.[1]
    return parseGitProxy(server)
  } catch {
    return ''
  }
}

async function recordPublishFailure(step, error) {
  const record = {
    time: new Date().toISOString(),
    step,
    message: error?.message || '发布失败',
    output: commandOutput(error),
  }
  await fs.appendFile(deploymentFailureLogPath, `${JSON.stringify(record)}\n`, 'utf8').catch(() => {})
}

// 把发布失败的原始英文输出翻译成用户能照做的中文解决办法。
function explainPublishError(output, step) {
  const text = String(output || '').toLowerCase()
  if (text.includes('could not resolve host') || text.includes('failed to connect') || text.includes('timed out') || text.includes('connection was reset') || text.includes('recv failure')) {
    return '看起来是网络连不上 GitHub。解决办法：1）检查电脑能否正常上网；2）如果用了加速器/VPN，尝试开启或关闭后重试；3）稍等一两分钟再点一次"发布上线"。你的修改已经保存在本地，不会丢失。'
  }
  if (text.includes('authentication failed') || text.includes('403') || text.includes('permission') || text.includes('access denied') || text.includes('could not read username')) {
    return 'GitHub 登录授权可能过期了。解决办法：点右上角"发布中心"，重新点一次"登录 GitHub"完成授权，再回来点"发布上线"。'
  }
  if (text.includes('rejected') || text.includes('non-fast-forward') || text.includes('fetch first') || text.includes('behind')) {
    return '远程仓库有比本地更新的内容（可能在别处改过）。解决办法：请联系技术支持帮忙合并，避免覆盖线上内容；不要自行强制推送。'
  }
  if (text.includes('no such remote') || text.includes('does not appear to be a git repository') || text.includes('repository not found')) {
    return '找不到 GitHub 仓库。解决办法：点右上角"发布中心"，确认"GitHub 仓库地址"填写正确（形如 https://github.com/你的账号/仓库名），再点"保存连接"后重试。'
  }
  if (text.includes('npm') || text.includes('vite') || text.includes('tsc') || text.includes('build') || step === 1) {
    return '网站构建这一步出错了（通常是内容里有异常字符或图片文件损坏）。解决办法：先点"检查网站"看具体报错，把最近一次修改撤销后再试；如果看不懂报错，把下方日志截图发给技术支持。'
  }
  return '这一步没有成功。你的修改已保存在本地，不会丢失。可以稍等片刻再点一次"发布上线"；若反复失败，请把下方发布日志截图发给技术支持。'
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
    // Windows Git may fail through Schannel while the same machine can reach
    // GitHub through Git's bundled OpenSSL backend.
    { args: ['-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/1.1', '-c', 'http.maxRequests=1', '-c', 'http.postBuffer=524288000', ...args], label: 'OpenSSL HTTP/1.1 single connection' },
    { args: ['-c', 'http.sslBackend=openssl', ...args], label: 'OpenSSL connection' },
    { args: ['-c', 'http.version=HTTP/1.1', '-c', 'http.sslBackend=schannel', ...args], label: 'Windows TLS connection' },
    { args, label: 'default connection' },
  ]
  const systemProxy = await readSystemGitProxy()
  if (systemProxy) {
    variants.unshift({
      args: ['-c', `http.proxy=${systemProxy}`, '-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/1.1', '-c', 'http.maxRequests=1', ...args],
      label: 'Windows system proxy + OpenSSL',
    })
  }
  let lastError
  for (let attempt = 0; attempt < variants.length; attempt += 1) {
    const variant = variants[attempt]
    if (attempt > 0) await sleep(Math.min(5000, 1200 * attempt))
    try {
      return { ...(await run('git', variant.args, { timeout: 45000 })), connectionMode: variant.label }
    } catch (error) {
      lastError = error
      if (!isTransientGitNetworkError(error)) break
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

function deploymentElapsedSeconds(startedAt) {
  return startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
}

async function monitorDeployment(vercelSiteUrl, commit, timeoutMilliseconds = 10 * 60 * 1000) {
  if (!vercelSiteUrl) {
    updatePublishProgress({ running: false, stage: 'pending', message: 'GitHub 已确认，但还没有填写 Vercel 网站地址', detail: '请在发布中心填写 vercel.app 地址后，再点击“立即检查”。', commit, url: '', elapsedSeconds: 0 })
    return
  }
  if (deploymentMonitorCommit === commit) return
  deploymentMonitorCommit = commit
  const startedAt = publishProgress.startedAt || Date.now()
  const deadline = Date.now() + timeoutMilliseconds
  let deployedCommit = publishProgress.deployedCommit || ''
  let lastDetail = '正在等待 Vercel 接收 GitHub 的最新提交。'
  let checkCount = 0
  try {
    while (Date.now() < deadline) {
      checkCount += 1
      const lastCheckedAt = Date.now()
      try {
        const deployed = await readDeploymentInfo(vercelSiteUrl)
        deployedCommit = String(deployed.commit || '')
        if (deployedCommit.toLowerCase() === commit.toLowerCase()) {
          updatePublishProgress({
            running: false,
            stage: 'success',
            currentStep: 5,
            message: 'GitHub 上传成功，Vercel 部署已确认',
            detail: `线上版本已切换到本次提交，整个过程耗时约 ${deploymentElapsedSeconds(startedAt)} 秒。`,
            commit,
            deployedCommit,
            url: vercelSiteUrl,
            startedAt,
            lastCheckedAt,
            checkCount,
            elapsedSeconds: deploymentElapsedSeconds(startedAt),
          })
          return
        }
        lastDetail = deployedCommit
          ? `线上仍是旧版本 ${deployedCommit.slice(0, 7)}，Vercel 正在构建或切换。`
          : 'Vercel 已收到更新，线上版本标记还没有生成。'
      } catch (error) {
        lastDetail = `暂时读不到线上状态，将自动重试：${error.message || String(error)}`
      }
      updatePublishProgress({
        running: true,
        stage: 'vercel-verify',
        currentStep: 5,
        message: 'Vercel 正在部署，系统会持续检查',
        detail: `${lastDetail} 已等待 ${deploymentElapsedSeconds(startedAt)} 秒。`,
        commit,
        deployedCommit,
        url: vercelSiteUrl,
        startedAt,
        lastCheckedAt,
        checkCount,
        elapsedSeconds: deploymentElapsedSeconds(startedAt),
      })
      await sleep(3000)
    }
    updatePublishProgress({
      running: false,
      stage: 'pending',
      currentStep: 5,
      message: 'Vercel 仍未确认完成，但 GitHub 已上传成功',
      detail: `已自动检查 ${deploymentElapsedSeconds(startedAt)} 秒。可以继续等待、立即检查，或打开线上网站查看。`,
      commit,
      deployedCommit,
      url: vercelSiteUrl,
      startedAt,
      lastCheckedAt: Date.now(),
      checkCount,
      elapsedSeconds: deploymentElapsedSeconds(startedAt),
    })
  } finally {
    deploymentMonitorCommit = ''
  }
}

function startDeploymentMonitor(vercelSiteUrl, commit) {
  void monitorDeployment(vercelSiteUrl, commit).catch((error) => {
    updatePublishProgress({
      running: false,
      stage: 'pending',
      currentStep: 5,
      message: 'GitHub 已上传，Vercel 状态检查暂时中断',
      detail: error.message || String(error),
      commit,
      url: vercelSiteUrl,
      lastCheckedAt: Date.now(),
    })
  })
}

async function editorApiAlreadyRunning() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 900)
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/editor/state`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return false
    const state = await response.json()
    return state && typeof state === 'object' && typeof state.version === 'number'
  } catch {
    return false
  }
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
    const previous = await ensureState()
    const state = {
      version: 1,
      overrides: next.overrides ?? {},
      insertions: Array.isArray(next.insertions) ? next.insertions : [],
      pages: Array.isArray(next.pages) ? next.pages : [],
      gallerySections: Array.isArray(next.gallerySections) ? next.gallerySections : (Array.isArray(previous.gallerySections) ? previous.gallerySections : []),
      galleryImageOrder: next.galleryImageOrder && typeof next.galleryImageOrder === 'object' ? next.galleryImageOrder : (previous.galleryImageOrder ?? {}),
      galleryHiddenImageIds: Array.isArray(next.galleryHiddenImageIds) ? next.galleryHiddenImageIds : (previous.galleryHiddenImageIds ?? []),
      contactCards: Array.isArray(next.contactCards) ? next.contactCards : (Array.isArray(previous.contactCards) ? previous.contactCards : undefined),
      contactButtons: Array.isArray(next.contactButtons) ? next.contactButtons : (Array.isArray(previous.contactButtons) ? previous.contactButtons : []),
      pricingOffers: Array.isArray(next.pricingOffers) ? next.pricingOffers : (Array.isArray(previous.pricingOffers) ? previous.pricingOffers : undefined),
    }
    await cleanupRemovedInsertionFiles(previous, state)
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
    let mobileOutputBuffer
    let width
    let height
    let mobileSrc
    if (mime.startsWith('image/')) {
      const sourceMetadata = await sharp(sourceBuffer).metadata()
      const sourceMax = Math.max(sourceMetadata.width || 0, sourceMetadata.height || 0)

      let pipeline = sharp(sourceBuffer, { animated: true }).rotate()

      // 4K 上限，但不低于 2K：原图 >= 2048 时限制到 3840，原图 < 2048 时保留原尺寸
      if (sourceMax >= 2048) {
        pipeline = pipeline.resize({
          width: 3840,
          height: 3840,
          fit: 'inside',
          withoutEnlargement: true,
        })
      }

      const optimized = pipeline.webp({ quality: 96, effort: 5, smartSubsample: true })
      outputBuffer = await optimized.toBuffer()
      const metadata = await sharp(outputBuffer).metadata()
      width = metadata.width
      height = metadata.height

      mobileOutputBuffer = await sharp(sourceBuffer, { animated: true })
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4, smartSubsample: true })
        .toBuffer()
      const mobileFileName = `${sourceBaseName}-mobile.webp`
      await fs.writeFile(path.join(targetDir, mobileFileName), mobileOutputBuffer)
      mobileSrc = `/${relativeDir.replaceAll(path.sep, '/')}/${mobileFileName}`
    }
    await fs.writeFile(path.join(targetDir, fileName), outputBuffer)
    sendJson(response, 200, {
      ok: true,
      src: `/${relativeDir.replaceAll(path.sep, '/')}/${fileName}`,
      format: mime.startsWith('image/') ? 'webp' : extension,
      srcMobile: mobileSrc,
      originalBytes: sourceBuffer.length,
      optimizedBytes: outputBuffer.length,
      mobileOptimizedBytes: mobileOutputBuffer?.length,
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
      const matched = String(deployed.commit || '').toLowerCase() === commit.toLowerCase()
      if (publishProgress.commit.toLowerCase() === commit.toLowerCase()) {
        updatePublishProgress({
          running: false,
          stage: matched ? 'success' : 'pending',
          currentStep: 5,
          message: matched ? 'GitHub 上传成功，Vercel 部署已确认' : 'GitHub 已上传，Vercel 仍在部署',
          detail: matched ? '线上版本已切换到本次提交。' : '线上版本还没有切换，系统会继续等待。',
          deployedCommit: deployed.commit || '',
          url: settings.vercelSiteUrl,
          lastCheckedAt: Date.now(),
          elapsedSeconds: deploymentElapsedSeconds(publishProgress.startedAt),
        })
      }
      sendJson(response, 200, {
        ok: true,
        status: matched ? 'success' : 'pending',
        message: matched ? 'Vercel 已部署完成' : 'Vercel 正在部署，线上版本尚未切换',
        commit,
        deployedCommit: deployed.commit || '',
        url: settings.vercelSiteUrl,
        progress: { ...publishProgress },
      })
    } catch (error) {
      sendJson(response, 200, {
        ok: true,
        status: 'pending',
        message: 'Vercel 已触发部署，暂时无法读取线上版本标记',
        commit,
        url: (await readSettings()).vercelSiteUrl,
        detail: error.message,
        progress: { ...publishProgress },
      })
    }
    return true
  }

  if (url.pathname === '/api/editor/recheck-vercel' && request.method === 'POST') {
    const body = await readJson(request)
    const commit = String(body.commit || '').trim()
    if (!commit) {
      sendJson(response, 400, { ok: false, message: '缺少要检查的提交编号' })
      return true
    }
    const settings = await readSettings()
    if (!settings.vercelSiteUrl) {
      sendJson(response, 400, { ok: false, message: '请先在发布中心填写 Vercel 网站地址' })
      return true
    }
    updatePublishProgress({
      running: true,
      stage: 'vercel-verify',
      currentStep: 5,
      message: '正在重新检查 Vercel 线上版本',
      detail: '正在读取线上版本标记，请稍候。',
      commit,
      url: settings.vercelSiteUrl,
      startedAt: publishProgress.startedAt || Date.now(),
      lastCheckedAt: 0,
      checkCount: publishProgress.checkCount || 0,
      elapsedSeconds: deploymentElapsedSeconds(publishProgress.startedAt || Date.now()),
    })
    startDeploymentMonitor(settings.vercelSiteUrl, commit)
    sendJson(response, 202, { ok: true, message: '已重新开始检查 Vercel 部署状态', progress: { ...publishProgress } })
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
      // 先构建（和“检查网站”完全相同的命令），确保“检查通过”与“发布第一步”结果一致。
      // 网络连接由真实 push 负责验证，避免发布前再额外做一次重复的 dry-run。
      const buildCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
      const buildArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build']
      await run(buildCommand, buildArgs)
      updatePublishProgress({ stage: 'commit', currentStep: 2, message: '网站构建通过，正在整理本地修改', detail: '跳过重复的网络预检，直接进行一次真实上传。' })
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
      const startedAt = Date.now()
      updatePublishProgress({
        running: true,
        stage: 'vercel-verify',
        currentStep: 5,
        message: 'GitHub 已确认，正在等待 Vercel 部署',
        detail: 'Vercel 会根据 GitHub 更新自动开始部署，系统会持续检查线上版本。',
        commit: commitSha,
        url: settings.vercelSiteUrl,
        startedAt,
        lastCheckedAt: 0,
        checkCount: 0,
        elapsedSeconds: 0,
      })
      startDeploymentMonitor(settings.vercelSiteUrl, commitSha)
      const vercel = {
        status: settings.vercelSiteUrl ? 'pending' : 'not-configured',
        message: settings.vercelSiteUrl ? 'GitHub 上传成功，Vercel 正在部署，后台会持续检查。' : 'GitHub 上传成功，但尚未填写 Vercel 网站地址。',
        commit: commitSha,
        url: settings.vercelSiteUrl,
      }
      sendJson(response, 200, {
        ok: true,
        output: [
          commitOutput,
          pushed.push.stdout,
          `Git network mode: ${pushed.push.connectionMode || 'default'}.`,
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
      await recordPublishFailure(errorStep, error)
      updatePublishProgress({ running: false, stage: 'error', errorStep, message: '发布失败', detail: output })
      sendJson(response, 502, {
        ok: false,
        message: `发布失败：${publishProgress.message}。${explainPublishError(output, errorStep)}`,
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
if (await editorApiAlreadyRunning()) {
  console.log(`[local-editor] API already running on http://127.0.0.1:${apiPort}; reusing the existing service.`)
  process.exit(0)
}
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
