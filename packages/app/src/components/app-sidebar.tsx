import type { MouseEvent } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@memorilo/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@memorilo/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@memorilo/components/ui/dropdown-menu'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger, useSidebar } from '@memorilo/components/ui/sidebar'
import { EventBus } from '@memorilo/utils/event-bus'
import { cn } from '@memorilo/utils/utils'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBook, LuChevronDown, LuClock, LuFlag, LuInfo, LuNotebookPen, LuSettings, LuUser } from 'react-icons/lu'
import { useSidebarSwipe } from '~/hooks/use-sidebar-swipe'
import { NoteFolderTree, NoteFolderTreeProvider } from './note-folder-tree'
import { NoteFolderTreeToolbar } from './note-folder-tree-toolbar'

const LazySettings = lazy(() => import('./settings').then(module => ({ default: module.Settings })))

export function AppSidebar() {
  const { t } = useTranslation('app')
  const { state: sidebarState, isMobile, openMobile, setOpenMobile } = useSidebar()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useSidebarSwipe({
    isMobile,
    openMobile,
    setOpenMobile,
  })

  const closeMobileSidebar = useCallback(() => {
    if (!isMobile || !openMobile)
      return
    EventBus.emit('SIDEBAR_CLOSE')
  }, [isMobile, openMobile])

  const handleSidebarAction = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!isMobile || !openMobile)
      return
    const target = event.target
    if (!(target instanceof Element))
      return
    if (!target.closest('[data-sidebar-action="close"]'))
      return
    closeMobileSidebar()
  }, [closeMobileSidebar, isMobile, openMobile])

  return (
    <>
      <Suspense>
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col min-h-0">
            <DialogHeader>
              <DialogTitle>{t('sidebar.settings')}</DialogTitle>
            </DialogHeader>
            <LazySettings />
          </DialogContent>
        </Dialog>
      </Suspense>

      <Sidebar collapsible="icon" className="select-none">
        <SidebarHeader>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className={cn(
                    'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground min-w-0 w-full overflow-hidden',
                    sidebarState === 'collapsed' && 'hidden',
                  )}
                >
                  <Avatar className="rounded-lg">
                    <AvatarImage />
                    <AvatarFallback className="rounded-lg">
                      <LuUser className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{t('sidebar.library_name')}</span>
                    <span className="truncate text-xs">{t('sidebar.user_name')}</span>
                  </div>
                  <LuChevronDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuItem onSelect={() => {
                  setIsSettingsOpen(true)
                  closeMobileSidebar()
                }}
                >
                  <div className="flex size-6 items-center justify-center rounded-md">
                    <LuSettings className="size-3.5 shrink-0" />
                  </div>
                  {t('sidebar.settings')}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/about"
                    onClick={closeMobileSidebar}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md">
                      <LuInfo className="size-3.5 shrink-0" />
                    </div>
                    {t('sidebar.about')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SidebarTrigger
              className={cn(
                'size-8 shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                isMobile && 'hidden',
              )}
            />
          </div>
        </SidebarHeader>
        <SidebarContent onClickCapture={handleSidebarAction}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t('sidebar.journal')}>
                    <Link to="/journals" data-sidebar-action="close">
                      <LuNotebookPen />
                      {t('sidebar.journal')}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t('sidebar.all_notes')}>
                    <Link to="/all-notes" data-sidebar-action="close">
                      <LuBook />
                      {t('sidebar.all_notes')}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip={t('sidebar.flashcards')} data-sidebar-action="close">
                    <LuFlag />
                    {t('sidebar.flashcards')}
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip={t('sidebar.edit_later')} data-sidebar-action="close">
                    <LuClock />
                    {t('sidebar.edit_later')}
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className={cn({
            invisible: sidebarState === 'collapsed',
          })}
          >
            <SidebarGroupContent>
              <NoteFolderTreeProvider>
                <NoteFolderTreeToolbar />
                <NoteFolderTree />
              </NoteFolderTreeProvider>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    </>
  )
}
