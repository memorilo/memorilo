import type { RenderElementProps } from 'slate-react'
import { lazy, Suspense } from 'react'

const TableLazy = lazy(() => import('./table').then(module => ({ default: module.Table })))
const TableHeadLazy = lazy(() => import('./table').then(module => ({ default: module.TableHead })))
const TableBodyLazy = lazy(() => import('./table').then(module => ({ default: module.TableBody })))
const TableFooterLazy = lazy(() => import('./table').then(module => ({ default: module.TableFooter })))
const TableRowLazy = lazy(() => import('./table').then(module => ({ default: module.TableRow })))
const TableHeaderCellLazy = lazy(() => import('./table').then(module => ({ default: module.TableHeaderCell })))
const TableCellLazy = lazy(() => import('./table').then(module => ({ default: module.TableCell })))
const TableContentLazy = lazy(() => import('./table').then(module => ({ default: module.TableContent })))

export function Table(props: RenderElementProps) {
  return (
    <Suspense>
      <TableLazy {...props} />
    </Suspense>
  )
}

export function TableHead(props: RenderElementProps) {
  return (
    <Suspense>
      <TableHeadLazy {...props} />
    </Suspense>
  )
}

export function TableBody(props: RenderElementProps) {
  return (
    <Suspense>
      <TableBodyLazy {...props} />
    </Suspense>
  )
}

export function TableFooter(props: RenderElementProps) {
  return (
    <Suspense>
      <TableFooterLazy {...props} />
    </Suspense>
  )
}

export function TableRow(props: RenderElementProps) {
  return (
    <Suspense>
      <TableRowLazy {...props} />
    </Suspense>
  )
}

export function TableHeaderCell(props: RenderElementProps) {
  return (
    <Suspense>
      <TableHeaderCellLazy {...props} />
    </Suspense>
  )
}

export function TableCell(props: RenderElementProps) {
  return (
    <Suspense>
      <TableCellLazy {...props} />
    </Suspense>
  )
}

export function TableContent(props: RenderElementProps) {
  return (
    <Suspense>
      <TableContentLazy {...props} />
    </Suspense>
  )
}
