import { Button } from '@memorilo/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@memorilo/components/ui/empty'
import { useTranslation } from 'react-i18next'
import { LuArrowUpRight, LuFolderCode } from 'react-icons/lu'

export function NotesEmpty() {
  const { t } = useTranslation('app')
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LuFolderCode />
        </EmptyMedia>
        <EmptyTitle>{t('notes_empty.title')}</EmptyTitle>
        <EmptyDescription>
          {t('notes_empty.description')}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button>{t('notes_empty.create_topic')}</Button>
          <Button variant="outline">{t('notes_empty.import_topic')}</Button>
        </div>
      </EmptyContent>
      <Button
        variant="link"
        render={props => <a {...props} href="#" />}
        className="text-muted-foreground"
        size="sm"
      >
        {t('notes_empty.learn_more')}
        {' '}
        <LuArrowUpRight />
      </Button>
    </Empty>
  )
}
