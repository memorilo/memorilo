# 配置模块使用文档

配置模块由两层组成：

- `@memorilo/config`：通用配置定义、Effect Schema 校验、存储、订阅、热更新和 React 配置控件。
- `@memorilo/desktop-config`：Memorilo 桌面应用的配置原型，目前包含 Language、Reduce motion 和 Outline Outdent behavior。

## 定义配置

使用 Effect Schema 描述完整配置，再用 `defineConfiguration` 添加默认值和页面字段。默认值会在定义阶段校验；字段路径必须能从默认配置中读取。

```ts
import * as Schema from 'effect/Schema'
import { defineConfiguration } from '@memorilo/config'

const AppConfigurationSchema = Schema.Struct({
  language: Schema.Literals(['system', 'en', 'zh-CN']),
  reduceMotion: Schema.Boolean,
})

export type AppConfiguration = typeof AppConfigurationSchema.Type

export const appConfigurationDefinition = defineConfiguration({
  id: 'example-app',
  schema: AppConfigurationSchema,
  defaults: {
    language: 'system',
    reduceMotion: false,
  },
  sections: [{
    id: 'general',
    label: 'General',
    fields: [
      {
        control: 'select',
        path: 'language',
        label: 'Language',
        options: [
          { value: 'system', label: 'System Default' },
          { value: 'en', label: 'English' },
          { value: 'zh-CN', label: '简体中文' },
        ],
      },
      {
        control: 'toggle',
        path: 'reduceMotion',
        label: 'Reduce motion',
      },
    ],
  }],
})
```

支持的控件是 `text`、`number`、`select` 和 `toggle`。`number` 可以额外指定 `min`、`max`、`step` 和 `unit`；`text` 可以指定 `placeholder`。`select` 的选项值必须唯一，并且必须包含默认值。

## 创建存储

存储适配器只需要实现 `read` 和 `write`，可选实现 `subscribe` 来触发外部变更刷新。

```ts
import { createConfigurationStore } from '@memorilo/config'

const adapter = {
  read: async () => loadConfigurationFromYourStorage(),
  write: async (configuration: unknown) => {
    await saveConfigurationToYourStorage(configuration)
  },
  subscribe: (listener: () => void) => subscribeToYourStorage(listener),
}

const store = await createConfigurationStore(
  appConfigurationDefinition,
  adapter,
  {
    onError: error => console.error('Configuration hot reload failed', error),
  },
)
```

读取到 `null` 时，模块使用定义中的默认值，并默认写回适配器。传入 `{ persistDefaults: false }` 可以关闭这次写回，例如浏览器预览或只读测试。

所有读取和写入都会经过 Effect Schema 解码。无效的已有配置或无效更新会抛出错误，不会静默回退到默认值。字段更新会串行化，因此同时调用多个 `setValue` 时，每次更新都基于上一次已经提交的快照。

## 读取、更新和订阅

```ts
const current = store.getSnapshot()

const unsubscribe = store.subscribe(() => {
  console.log('Configuration changed', store.getSnapshot())
})

await store.setValue('language', 'zh-CN')
await store.set({ language: 'en', reduceMotion: true })
await store.refresh()

unsubscribe()
store.close()
```

`refresh()` 会从适配器重新读取并校验配置。适配器的 `subscribe` 通常用于文件监听、跨进程事件或其他外部存储通知；通知本身不携带配置值，存储模块会负责重新读取。

## JSON 文件适配器

Node 环境可以使用 `@memorilo/config/node` 提供的 JSON 文件适配器：

```ts
import { join } from 'node:path'
import { app } from 'electron'
import { createConfigurationStore } from '@memorilo/config'
import { createJsonFileConfigurationAdapter } from '@memorilo/config/node'

const store = await createConfigurationStore(
  appConfigurationDefinition,
  createJsonFileConfigurationAdapter(join(app.getPath('userData'), 'configuration.json')),
)
```

适配器会创建父目录，以临时文件加 `rename` 的方式原子写入，并监听配置文件所在目录的替换事件。`debounceMs` 可以调整外部文件变更的合并窗口，默认为 30ms。

## 生成 React 配置页面

`@memorilo/config/react` 的 `ConfigurationFields` 会根据配置原型生成表单控件，并使用 `store.setValue` 提交变更：

```tsx
import type { ConfigurationStore } from '@memorilo/config'
import { ConfigurationFields } from '@memorilo/config/react'

const section = appConfigurationDefinition.sections[0]
if (!section)
  throw new Error('Configuration requires a section')

export function ConfigurationPane({ store }: { store: ConfigurationStore<AppConfiguration> }) {
  return <ConfigurationFields fields={section.fields} store={store} />
}
```

控件会显示校验错误、在写入期间禁用当前控件，并通过 `useSyncExternalStore` 响应热更新。组件样式由调用方的 StyleX 构建配置负责提取。

Vite 使用 `@stylexjs/unplugin` 时，需要把配置包列入 `externalPackages`：

```ts
import stylex from '@stylexjs/unplugin/vite'

const stylexOptions: NonNullable<Parameters<typeof stylex>[0]> & {
  externalPackages: string[]
} = {
  cssInjectionTarget: fileName => fileName.includes('renderer-global'),
  externalPackages: ['@memorilo/config'],
  unstable_moduleResolution: { type: 'commonJS' },
  useCSSLayers: true,
}

stylex(stylexOptions)
```

`@stylexjs/unplugin` 0.19 支持 `externalPackages`，但当前类型声明没有包含它，因此示例显式补充了该属性。

多 HTML 入口必须共同导入一个实际的 CSS 文件，并用上例的 `cssInjectionTarget` 指向它，确保 StyleX 汇总规则被两个入口引用。Memorilo 让所有入口导入 `renderer-global.css`。

## Memorilo 桌面设置

桌面配置原型位于 [`apps/desktop/config/src/index.ts`](../apps/desktop/config/src/index.ts)。主进程会把 JSON 文件存储在 Electron `userData` 目录下，并通过 IPC 暴露：

- `window.desktop.getConfiguration()`
- `window.desktop.setConfiguration(configuration)`
- `window.desktop.subscribeConfiguration(listener)`

设置窗口是独立的、非模态、单实例 `BrowserWindow`，由 App 菜单的 `Settings…` 和 `CmdOrCtrl+,` 打开。设置页面入口是 `apps/desktop/renderer/settings.html`，没有 Electron 时会使用内存适配器，因此可以在浏览器中进行视觉调试和交互测试。

新增桌面设置时，需要同步修改：

1. `apps/desktop/config/src/index.ts` 中的 Effect Schema、默认值和字段原型。
2. 设置页面无需手写控件，`ConfigurationFields` 会从原型生成。
3. 如设置影响全局行为，在 `DesktopConfigurationEnvironment` 中消费配置并处理系统辅助功能偏好。
4. 浏览器设置测试 `apps/desktop/renderer/src/settings/settings.test.tsx`。

`Outdent behavior` 位于设置窗口的 Editor 分组，默认值为 `logical`。旧版 `configuration.json` 缺少该字段时，主进程会补齐默认值并原子写回；字段存在但值非法时仍会拒绝配置。设置变更通过配置订阅实时应用到已打开的 Outline 编辑器。

## 测试命令

```bash
pnpm --filter @memorilo/config test
pnpm --filter @memorilo/desktop-renderer test
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

配置页面测试使用 Vitest Browser + Playwright，不依赖 Electron；Electron e2e 只用于验证主进程启动、IPC、打包和最终用户工作流。
