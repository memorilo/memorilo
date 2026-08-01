# Renderer toast 使用指南

桌面 renderer 使用全局挂载的 React-Toastify 容器显示非阻塞通知。容器由
`AppShell` 统一提供，Liquid Glass 主题、图标、动画、关闭按钮、堆叠上限和
辅助功能适配集中定义在 `apps/desktop/renderer/src/components/app-toast.*`。

## 模块边界

仅在 `apps/desktop/renderer` 中直接调用 toast：

```tsx
import { toast } from 'react-toastify/unstyled'
```

不要在页面或功能组件中再次渲染 `ToastContainer`，也不要重复导入
`ReactToastify.css`。`main`、`preload` 和 `packages/editor` 不应依赖 renderer 的
私有组件；如果编辑器操作需要通知，由 renderer 在集成边界接收结果并显示。

## 选择等级

| API | 用途 |
| --- | --- |
| `toast(...)` | 中性状态或可逆操作 |
| `toast.info(...)` | 不要求用户立即处理的信息变化 |
| `toast.success(...)` | 已明确完成的操作 |
| `toast.warning(...)` | 需要注意或处理、但尚未失败的状态 |
| `toast.error(...)` | 操作失败，或用户的结果没有被保存 |
| `toast.loading(...)` | 已开始且尚未完成的异步操作 |

通知应简短、具体，并说明结果。不要用 success toast 确认每一次普通点击，也不要
用 warning 或 error 仅仅吸引注意力。

```tsx
toast.success('Note moved to Archive')
toast.info('3 linked Notes were updated')
toast.warning('This Note has unsynced changes')
toast.error('Could not save the latest changes')
```

默认通知在 5 秒后关闭，鼠标悬停、窗口失焦或键盘焦点进入通知时会暂停计时。
同一时间最多显示 4 条，新通知位于上方。

## 动作按钮

需要一个直接后续动作时，传入包含消息和原生 `button` 的内容。主题会把消息与
动作排在同一行，并提供 hover、pressed 和 focus-visible 状态。

```tsx
import type { ToastContentProps } from 'react-toastify/unstyled'
import { toast } from 'react-toastify/unstyled'

function ArchiveToast({ closeToast }: ToastContentProps) {
  async function undoArchive() {
    await restoreArchivedNote()
    closeToast()
  }

  return (
    <div>
      <p>Note moved to Archive</p>
      <button type="button" onClick={undoArchive}>Undo</button>
    </div>
  )
}

toast.success(ArchiveToast, {
  ariaLabel: 'Note moved to Archive. Undo is available.',
  autoClose: 8_000,
})
```

每条 toast 最多放一个主要动作。动作必须使用 `button` 或语义正确的链接，不要
在 toast 内创建第二层卡片、彩色胶囊或自定义玻璃背景。

## Promise 与 loading

已知完整 Promise 生命周期时优先使用 `toast.promise`。它会复用同一条通知，自动
从 spinner 切换到完成或失败图标，并返回原 Promise 的结果。

```tsx
const savedNote = await toast.promise(saveNote(note), {
  pending: 'Saving changes...',
  success: 'Changes saved',
  error: 'Could not save changes',
})
```

需要在流程中决定最终内容时，保存 `toast.loading` 返回的 ID，并显式恢复 loading
期间关闭的计时、关闭按钮和拖拽行为：

```tsx
const toastId = toast.loading('Exporting workspace...')

try {
  await exportWorkspace()
  toast.update(toastId, {
    autoClose: 5_000,
    closeButton: true,
    draggable: 'touch',
    isLoading: false,
    render: 'Workspace exported',
    type: 'success',
  })
}
catch (error) {
  toast.update(toastId, {
    autoClose: 8_000,
    closeButton: true,
    draggable: 'touch',
    isLoading: false,
    render: 'Could not export workspace',
    type: 'error',
  })
  throw error
}
```

## 进度

默认隐藏自动关闭计时条。只有进度本身能帮助用户判断等待时间时才显示它。

显示自动关闭进度：

```tsx
toast.info('Index updated', {
  autoClose: 8_000,
  hideProgressBar: false,
})
```

显示受控任务进度：

```tsx
const toastId = toast('Exporting workspace...', {
  autoClose: false,
  closeButton: false,
  hideProgressBar: false,
  progress: 0.01,
})

exporter.onProgress((completed, total) => {
  toast.update(toastId, { progress: completed / total })
})

await exporter.finished
toast.update(toastId, {
  autoClose: 5_000,
  closeButton: true,
  progress: undefined,
  render: 'Workspace exported',
  type: 'success',
})
```

进度值必须位于 `0` 到 `1`。不确定剩余工作量时使用 `toast.loading` 的 spinner，
不要展示虚假的百分比。

## 去重、更新与关闭

为可能重复触发的状态提供稳定 `toastId`：

```tsx
toast.warning('Sync is paused while offline', {
  toastId: 'sync-offline',
})
```

React-Toastify 会忽略相同 ID 的重复通知。需要主动关闭时保存返回值：

```tsx
const toastId = toast.info('Preparing preview...', { autoClose: false })

cancelPreview()
toast.dismiss(toastId)
```

`autoClose: false` 只适用于 loading、持续状态或必须由用户处理的通知。普通结果通知
应自动关闭，避免长期遮挡内容。

## 主题与辅助功能约束

- 不要传入 `theme: 'dark'`、`theme: 'colored'`、自定义背景色或自定义状态图标。
- 不要修改 `toastClassName`、`progressClassName` 或 transition；这些由全局容器管理。
- 为仅凭可见文本无法完整表达的通知提供具体 `ariaLabel`。
- 动作按钮必须可通过键盘触达，并保留可见焦点状态。
- 系统启用 Reduce Transparency、Increase Contrast 或 Reduce Motion 时，全局主题会
  自动切换为更实、更明确或更少运动的表现；调用方不需要单独判断媒体查询。
- toast 用于非阻塞反馈。需要用户作出决定、确认破坏性操作或阅读较长内容时，使用
  dialog、sheet 或页面内状态，不要延长 toast 文案。

完整的第三方 API 参考见
[React-Toastify documentation](https://fkhadra.github.io/react-toastify/introduction/)。本项目
约束优先于上游示例中的默认主题和容器配置。
