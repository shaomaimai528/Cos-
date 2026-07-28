# 界面流畅性与部署优化

## 目标

减少页面切换、画廊加载和后台预览中的重复工作，并让生产部署的缓存边界清晰、构建可检查、项目可交接。

## 切片

1. 共享公开内容请求，并限制编辑器运行时的 DOM 观察范围。
   - 文件：`src/galleryData.ts`、`src/editor/EditorRuntime.tsx`、必要时 `src/components/PageAudioControl.tsx`
   - 验证：同一页面切换时只产生一次内容请求；编辑器仍能应用新节点、图片替换和预览消息。
2. 移动端与低性能设备降级。
   - 文件：`src/components/BackgroundVideo.tsx`、`src/HomePage.tsx`、`src/styles.css`
   - 验证：移动端画廊可原生滚动、图片布局不跳动、减少动态效果时无多余动画或视频播放。
3. 部署和交接。
   - 文件：`vercel.json`、`package.json`、`README.md`
   - 验证：`npm run build` 通过；部署信息不缓存，带哈希静态资源长期缓存，编辑器内容不缓存；本地启动和部署步骤可按说明执行。

## 非目标

不重写现有页面视觉风格，不改变后台数据结构，不删除用户已有图片或编辑内容。
