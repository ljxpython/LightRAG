import React from 'react'
import {
  LayoutDashboardIcon,
  FolderKanbanIcon,
  Share2Icon,
  MessagesSquareIcon,
  RocketIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  BookOpenIcon,
  ExternalLinkIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { useSettingsStore } from '@/stores/settings'
import { backendBaseUrl } from '@/lib/constants'
import type { Tab } from '@/stores/settings'
import EnterpriseLogo from './EnterpriseLogo'

interface AppSidebarProps {
  currentTab: string
  onTabChange: (tab: Tab) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

interface NavItem {
  id: Tab
  label: string
  labelZh: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    labelZh: '资产概览',
    icon: LayoutDashboardIcon
  },
  {
    id: 'documents',
    label: 'Knowledge Hub',
    labelZh: '知识资产',
    icon: FolderKanbanIcon
  },
  {
    id: 'knowledge-graph',
    label: 'Graph Studio',
    labelZh: '图谱工坊',
    icon: Share2Icon
  },
  {
    id: 'retrieval',
    label: 'Chat Studio',
    labelZh: '智能问答',
    icon: MessagesSquareIcon
  },
  {
    id: 'release',
    label: 'Release Control',
    labelZh: '版本发布',
    icon: RocketIcon
  }
]

export default function AppSidebar({
  currentTab,
  onTabChange,
  collapsed,
  onToggleCollapse
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-border/70 bg-card/60 backdrop-blur-md transition-all duration-300 ease-in-out select-none z-30',
        collapsed ? 'w-16 xl:w-18' : 'w-60 xl:w-64'
      )}
    >
      {/* 1. Brand Header */}
      <div className="flex h-14 items-center border-b border-border/50 px-3.5 xl:px-4">
        <EnterpriseLogo size={32} withText={!collapsed} subtitle="Enterprise Studio" />
      </div>

      {/* 2. Navigation List */}
      <div className="flex-1 overflow-y-auto px-2.5 xl:px-3 py-3.5 space-y-1.5 xl:space-y-2">
        <TooltipProvider delayDuration={100}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentTab === item.id

            const buttonContent = (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'group flex w-full items-center gap-3.5 rounded-xl px-3 py-2.5 xl:py-3 text-sm font-medium transition-all duration-150',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'size-5 xl:size-5.5 shrink-0 transition-colors',
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                {!collapsed && (
                  <div className="flex flex-1 items-center justify-between overflow-hidden text-left">
                    <span className="truncate font-medium">{item.label}</span>
                    <span className="text-xs opacity-75 ml-1.5 truncate font-normal">
                      {item.labelZh}
                    </span>
                  </div>
                )}
                {item.badge && !collapsed && (
                  <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                    {item.badge}
                  </span>
                )}
              </button>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[10px] opacity-70">({item.labelZh})</span>
                  </TooltipContent>
                </Tooltip>
              )
            }

            return buttonContent
          })}

          <div className="my-2 h-px bg-border/40" />

          {/* API 文档外部链接 */}
          {(() => {
            const theme = useSettingsStore.getState().theme
            const apiDocsUrl = `${backendBaseUrl}/docs?theme=${theme === 'system' ? 'auto' : theme}`

            const apiDocsContent = (
              <a
                href={apiDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group flex w-full items-center gap-3.5 rounded-xl px-3 py-2.5 xl:py-3 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all duration-150 cursor-pointer',
                  collapsed && 'justify-center px-2'
                )}
                title="打开 Swagger / OpenAPI 接口文档"
              >
                <BookOpenIcon className="size-5 xl:size-5.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                {!collapsed && (
                  <div className="flex flex-1 items-center justify-between overflow-hidden text-left">
                    <span className="truncate font-medium">API 文档</span>
                    <span className="text-xs opacity-75 ml-1.5 truncate font-normal">
                      Swagger UI
                    </span>
                  </div>
                )}
                {!collapsed && (
                  <ExternalLinkIcon className="size-3.5 xl:size-4 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
                )}
              </a>
            )

            if (collapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{apiDocsContent}</TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium">API 文档</span>
                    <span className="text-[10px] opacity-70">(Swagger UI)</span>
                  </TooltipContent>
                </Tooltip>
              )
            }

            return apiDocsContent
          })()}
        </TooltipProvider>
      </div>

      {/* 3. Footer Area */}
      <div className="border-t border-border/50 p-2.5 xl:p-3 space-y-2">
        {!collapsed && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 text-left">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-xs xl:text-sm">
              <ShieldCheckIcon className="size-4 shrink-0" />
              <span>双轨生产网关就绪</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80 leading-snug">
              FastMCP 8001 & WebUI 9621
            </p>
          </div>
        )}

        {/* Collapse Toggle Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center gap-2 rounded-lg p-2 text-xs xl:text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? (
            <ChevronRightIcon className="size-4.5 xl:size-5" />
          ) : (
            <>
              <ChevronLeftIcon className="size-4.5 xl:size-5" />
              <span className="text-xs xl:text-sm font-medium">收起导航</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
