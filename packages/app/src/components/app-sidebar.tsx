import type { MouseEvent } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@memorilo/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@memorilo/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@memorilo/components/ui/dropdown-menu'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from '@memorilo/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { EventBus, SIDEBAR_CLOSE_EVENT } from '@memorilo/utils/event-bus'
import { cn } from '@memorilo/utils/utils'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBook, LuChevronDown, LuClock, LuFlag, LuInfo, LuNotebookPen, LuPanelLeft, LuSettings, LuUser } from 'react-icons/lu'
import { useSidebarSwipe } from '~/hooks/use-sidebar-swipe'
import { NoteFolderTree, NoteFolderTreeProvider } from './note-folder-tree'
import { NoteFolderTreeToolbar } from './note-folder-tree-toolbar'

const LazySettings = lazy(() => import('./settings').then(module => ({ default: module.Settings })))

export function AppSidebar() {
  const { t } = useTranslation('app')
  const { state: sidebarState, toggleSidebar, isMobile, openMobile, setOpenMobile } = useSidebar()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useSidebarSwipe({
    isMobile,
    openMobile,
    setOpenMobile,
  })

  const closeMobileSidebar = useCallback(() => {
    if (!isMobile || !openMobile)
      return
    EventBus.emit(SIDEBAR_CLOSE_EVENT)
  }, [isMobile, openMobile])

  const handleSidebarAction = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!isMobile || !openMobile)
      return
    const target = event.target
    if (!(target instanceof Element))
      return
    if (!target.closest('[data-sidebar-action="close"]'))
      return
    EventBus.emit(SIDEBAR_CLOSE_EVENT)
  }, [isMobile, openMobile])

  return (
    <>
      <Suspense>
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
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
              <DropdownMenuTrigger
                className={cn(
                  'min-w-0',
                  {
                    hidden: sidebarState === 'collapsed',
                  },
                )}
                render={triggerProps => (
                  <SidebarMenuButton
                    {...triggerProps}
                    size="lg"
                    className={cn(
                      'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground min-w-0 w-full overflow-hidden',
                      triggerProps.className,
                    )}
                  >
                    <Avatar className="rounded-lg after:rounded-lg">
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
                )}
              />
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuItem onClick={() => {
                  setIsSettingsOpen(true)
                  closeMobileSidebar()
                }}
                >
                  <div className="flex size-6 items-center justify-center rounded-md">
                    <LuSettings className="size-3.5 shrink-0" />
                  </div>
                  {t('sidebar.settings')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={props => (
                    <Link
                      {...props}
                      to="/about"
                      onClick={(event) => {
                        props.onClick?.(event)
                        closeMobileSidebar()
                      }}
                    />
                  )}
                >
                  <div className="flex size-6 items-center justify-center rounded-md">
                    <LuInfo className="size-3.5 shrink-0" />
                  </div>
                  {t('sidebar.about')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SidebarMenuButton
              className={cn(
                'size-8 shrink-0 p-0',
                {
                  hidden: isMobile,
                },
              )}
              onClick={toggleSidebar}
              aria-label="Toggle Sidebar"
            >
              <LuPanelLeft className="size-4 cn-rtl-flip" />
            </SidebarMenuButton>
          </div>
        </SidebarHeader>
        <SidebarContent onClickCapture={handleSidebarAction}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger
                      render={triggerProps => (
                        <SidebarMenuButton
                          {...triggerProps}
                          data-sidebar-action="close"
                          render={props => <Link {...props} to="/journals" />}
                        >
                          <LuNotebookPen />
                          {t('sidebar.journal')}
                        </SidebarMenuButton>
                      )}
                    />
                    <TooltipContent side="right" align="center">
                      {t('sidebar.journal')}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger
                      render={triggerProps => (
                        <SidebarMenuButton
                          {...triggerProps}
                          data-sidebar-action="close"
                          render={props => <Link {...props} to="/all-notes" />}
                        >
                          <LuBook />
                          {t('sidebar.all_notes')}
                        </SidebarMenuButton>
                      )}
                    />
                    <TooltipContent side="right" align="center">
                      {t('sidebar.all_notes')}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger
                      render={triggerProps => (
                        <SidebarMenuButton
                          {...triggerProps}
                          data-sidebar-action="close"
                        >
                          <LuFlag />
                          {t('sidebar.flashcards')}
                        </SidebarMenuButton>
                      )}
                    />
                    <TooltipContent side="right" align="center">
                      {t('sidebar.flashcards')}
                    </TooltipContent>
                  </Tooltip>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger
                      render={triggerProps => (
                        <SidebarMenuButton
                          {...triggerProps}
                          data-sidebar-action="close"
                        >
                          <LuClock />
                          {t('sidebar.edit_later')}
                        </SidebarMenuButton>
                      )}
                    />
                    <TooltipContent side="right" align="center">
                      {t('sidebar.edit_later')}
                    </TooltipContent>
                  </Tooltip>
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
