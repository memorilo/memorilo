import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { createRuntimeInfoQueryOptions } from '../lib/runtime-query'
import { appStyles } from '../styles/app.stylex'

function HomeRoute() {
  const runtime = useQuery(createRuntimeInfoQueryOptions(window.desktop))

  return (
    <section {...stylex.props(appStyles.page, appStyles.pageNarrow)}>
      <header {...stylex.props(appStyles.pageHeader)}>
        <p {...stylex.props(appStyles.eyebrow)}>Desktop baseline</p>
        <h1 {...stylex.props(appStyles.pageTitle)}>Runtime</h1>
      </header>
      {runtime.isPending ? <p {...stylex.props(appStyles.status)}>Loading runtime information...</p> : null}
      {runtime.isError ? <p {...stylex.props(appStyles.status, appStyles.statusError)}>Unable to read runtime information.</p> : null}
      {runtime.data
        ? (
            <dl {...stylex.props(appStyles.runtimeGrid)}>
              <div {...stylex.props(appStyles.runtimeCell)}>
                <dt {...stylex.props(appStyles.runtimeTerm)}>Electron</dt>
                <dd {...stylex.props(appStyles.runtimeDescription)} data-testid="runtime-version">{runtime.data.version}</dd>
              </div>
              <div {...stylex.props(appStyles.runtimeCell, appStyles.runtimeCellBorder)}>
                <dt {...stylex.props(appStyles.runtimeTerm)}>Platform</dt>
                <dd {...stylex.props(appStyles.runtimeDescription)}>{runtime.data.platform}</dd>
              </div>
            </dl>
          )
        : null}
    </section>
  )
}

export const Route = createFileRoute('/')({ component: HomeRoute })
