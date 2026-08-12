import type { ReaderOutlineItem } from '../types'

interface ReaderOutlineSourceBase<Target> {
  children: readonly ReaderOutlineSource<Target>[]
  href?: string
  label: string
}

export type ReaderOutlineSource<Target> = ReaderOutlineSourceBase<Target> & (
  | { navigable: false, target?: never }
  | { navigable: true, target: Target }
)

interface ReaderOutlineTarget<Target> {
  value: Target
}

export class ReaderOutlineProjection<Target> {
  readonly items: readonly ReaderOutlineItem[]
  private readonly targets = new Map<string, ReaderOutlineTarget<Target>>()

  constructor(
    idPrefix: string,
    sources: readonly ReaderOutlineSource<Target>[],
    private readonly missingTarget: (outlineItemId: string) => Error,
  ) {
    this.items = this.project(sources, idPrefix)
  }

  requireTarget(outlineItemId: string): Target {
    const target = this.targets.get(outlineItemId)
    if (!target)
      throw this.missingTarget(outlineItemId)
    return target.value
  }

  private project(
    sources: readonly ReaderOutlineSource<Target>[],
    parentId: string,
  ): ReaderOutlineItem[] {
    return sources.map((source, index) => {
      const id = `${parentId}.${index}`
      if (source.navigable)
        this.targets.set(id, { value: source.target })
      return {
        children: this.project(source.children, id),
        href: source.href,
        id,
        label: source.label,
        navigable: source.navigable,
      }
    })
  }
}
