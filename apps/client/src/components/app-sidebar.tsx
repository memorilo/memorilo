import { Avatar, AvatarFallback, AvatarImage } from '@memorilo/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@memorilo/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@memorilo/components/ui/dropdown-menu'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger, useSidebar } from '@memorilo/components/ui/sidebar'
import { cn } from '@memorilo/utils/utils'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBook, LuChevronDown, LuClock, LuFlag, LuNotebookPen, LuSettings, LuUser } from 'react-icons/lu'
import { NoteFolderTree, NoteFolderTreeProvider } from './note-folder-tree'
import { NoteFolderTreeToolbar } from './note-folder-tree-toolbar'
import { Settings } from './settings'

export function AppSidebar() {
  const { t } = useTranslation('app')
  const { state: sidebarState } = useSidebar()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  return (
    <>
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sidebar.settings')}</DialogTitle>
          </DialogHeader>
          <Settings />
        </DialogContent>
      </Dialog>

      <Sidebar collapsible="icon" className="select-none">
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
                className={cn(
                  {
                    hidden: sidebarState === 'collapsed',
                  },
                )}
              >
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="flex aspect-square size-8 items-center justify-center rounded-lg border">
                    <AvatarImage className="size-4" />
                    <AvatarFallback className="size-4"><LuUser className="size-4" /></AvatarFallback>
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
                <DropdownMenuItem onSelect={() => setIsSettingsOpen(true)}>
                  <div className="flex size-6 items-center justify-center rounded-md">
                    <LuSettings className="size-3.5 shrink-0" />
                  </div>
                  {t('sidebar.settings')}
                  <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SidebarMenuButton asChild>
              <SidebarTrigger className="size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            </SidebarMenuButton>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t('sidebar.journal')}>
                    <a>
                      <LuNotebookPen />
                      {t('sidebar.journal')}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t('sidebar.all_notes')}>
                    <Link to="/all-notes">
                      <LuBook />
                      {t('sidebar.all_notes')}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t('sidebar.flashcards')}>
                    <a>
                      <LuFlag />
                      {t('sidebar.flashcards')}
                    </a>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t('sidebar.edit_later')}>
                    <a>
                      <LuClock />
                      {t('sidebar.edit_later')}
                    </a>
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
