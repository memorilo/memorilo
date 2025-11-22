import { Button } from '@memorilo/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@memorilo/components/ui/empty'
import { LuArrowUpRight, LuFolderCode } from 'react-icons/lu'

export function NotesEmpty() {
  return (
    (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuFolderCode />
          </EmptyMedia>
          <EmptyTitle>No Topic Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any topics yet. Get started by creating
            your first topic.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button>Create Topic</Button>
            <Button variant="outline">Import Topic</Button>
          </div>
        </EmptyContent>
        <Button
          variant="link"
          asChild
          className="text-muted-foreground"
          size="sm"
        >
          <a href="#">
            Learn More
            {' '}
            <LuArrowUpRight />
          </a>
        </Button>
      </Empty>
    )

  )
}
