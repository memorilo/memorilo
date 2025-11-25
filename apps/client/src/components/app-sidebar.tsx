import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger, useSidebar } from '@memorilo/components/ui/sidebar'
import { cn } from '@memorilo/utils/utils'
import { Link } from '@tanstack/react-router'
import { LuBook, LuClock, LuFlag, LuNotebookPen } from 'react-icons/lu'
import { NotesFolderTree, NotesTreeProvider } from './notes-folder-tree'
import { NotesFolderTreeToolbar } from './notes-folder-tree-toolbar'

export function AppSidebar() {
  const { state: sidebarState } = useSidebar()
  return (
    <Sidebar collapsible="icon" className="select-none">
      <SidebarHeader></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Journal">
                  <a>
                    <LuNotebookPen />
                    Journal
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="All Notes">
                  <Link to="/all-notes">
                    <LuBook />
                    All Notes
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Flashcards">
                  <a>
                    <LuFlag />
                    Flashcards
                  </a>
                </SidebarMenuButton>
                <SidebarMenuBadge>0</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Edit later">
                  <a>
                    <LuClock />
                    Edit later
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
            <NotesTreeProvider>
              <NotesFolderTreeToolbar />
              <NotesFolderTree />
            </NotesTreeProvider>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Toggle Sidebar">
              <SidebarTrigger className="justify-start" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
