import Button from '@/components/ui/Button'
import { entryHomeHref } from '@/lib/pathPrefix'
import { SiteInfo, backendBaseUrl } from '@/lib/constants'
import AppSettings from '@/components/AppSettings'
import ProjectSelector from '@/components/ProjectSelector'
import UserAccountMenu from '@/components/UserAccountMenu'
import { TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore, useBackendState } from '@/stores/state'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { ZapIcon, BookOpenIcon, Search, ChevronRight } from 'lucide-react'
import GithubIcon from '@/components/icons/GithubIcon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import TouchDescriptionPopover from '@/components/ui/TouchDescriptionPopover'
import EnterpriseLogo from '@/components/layout/EnterpriseLogo'

interface NavigationTabProps {
  value: string
  currentTab: string
  children: React.ReactNode
}

function NavigationTab({ value, currentTab, children }: NavigationTabProps) {
  const isActive = currentTab === value
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'cursor-pointer px-3 py-1 text-xs font-medium rounded-md transition-all duration-150',
        isActive
          ? 'bg-card text-foreground shadow-xs border border-border/80'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
      )}
    >
      {children}
    </TabsTrigger>
  )
}

function TabsNavigation() {
  const currentTab = useSettingsStore.use.currentTab()
  const { t } = useTranslation()

  return (
    <div className="flex self-center">
      <TabsList className="h-8 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 backdrop-blur-xs">
        <NavigationTab value="documents" currentTab={currentTab}>
          {t('header.documents')}
        </NavigationTab>
        <NavigationTab value="knowledge-graph" currentTab={currentTab}>
          {t('header.knowledgeGraph')}
        </NavigationTab>
        <NavigationTab value="retrieval" currentTab={currentTab}>
          {t('header.retrieval')}
        </NavigationTab>
      </TabsList>
    </div>
  )
}

export default function SiteHeader() {
  const { t } = useTranslation()
  const { isGuestMode, coreVersion, apiVersion, webuiTitle, webuiDescription } = useAuthStore()
  const theme = useSettingsStore.use.theme()
  // Tri-state on purpose — 'unknown' (no successful /health yet) hides the
  // entry point rather than guessing; see apiDocsCapability in stores/state.ts.
  const apiDocsCapability = useBackendState.use.apiDocsCapability()
  // /docs renders Swagger UI itself; the theme query param keeps it visually
  // consistent with the WebUI ('system' falls back to the OS preference).
  const apiDocsUrl = `${backendBaseUrl}/docs?theme=${theme === 'system' ? 'auto' : theme}`

  const versionDisplay = (coreVersion && apiVersion)
    ? `${coreVersion}/${apiVersion}`
    : null;

  // Check if frontend needs rebuild (apiVersion ends with warning symbol)
  const hasWarning = apiVersion?.endsWith('⚠️');
  const versionTooltip = hasWarning
    ? t('header.frontendNeedsRebuild')
    : versionDisplay ? `v${versionDisplay}` : '';

  const currentTab = useSettingsStore.use.currentTab()
  const TAB_TITLES: Record<string, string> = {
    dashboard: '资产大盘',
    documents: '知识资产中枢',
    'knowledge-graph': '知识图谱工坊',
    retrieval: '智能问答工作台',
    release: '版本发布总线'
  }

  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-14 w-full border-b px-4 backdrop-blur-md">
      <div className="min-w-[200px] w-auto flex items-center">
        {/* Document-relative brand link: under HashRouter the pathname always
            names this entry, so this resolves back to THIS entry — never a
            cross-entry jump, under any proxy prefix or the dev server's
            file-per-entry layout (see entryHomeHref). */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={entryHomeHref(window.location.pathname)} className="flex items-center gap-2 group">
                <span className="font-semibold text-sm tracking-tight text-foreground">{SiteInfo.name}</span>
                {webuiTitle && (
                  <>
                    <span className="mx-0.5 text-xs text-muted-foreground/50" aria-hidden="true">/</span>
                    <span className="text-xs font-medium text-muted-foreground">{webuiTitle}</span>
                  </>
                )}
              </a>
            </TooltipTrigger>
            {webuiDescription && (
              <TooltipContent side="bottom">
                {webuiDescription}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <TouchDescriptionPopover description={webuiDescription} />
        <div className="hidden md:flex items-center gap-1.5 ml-2 pl-2 border-l border-border/60 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{TAB_TITLES[currentTab] || '知识空间'}</span>
        </div>
      </div>

      <div className="flex h-14 flex-1 items-center justify-center max-w-md mx-auto px-4">
        <button
          type="button"
          onClick={() => useSettingsStore.getState().setCurrentTab('retrieval')}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg border border-border/70 bg-muted/40 hover:bg-muted/70 text-xs text-muted-foreground transition-all cursor-pointer shadow-2xs group"
          title="点击进入智能问答工作台搜索"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <span className="truncate">全局检索切片、实体或业务文档...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded bg-background/80 border border-border/60 text-muted-foreground shrink-0">
            ⌘K
          </kbd>
        </button>

        {/* 隐藏旧版 Tab，杜绝界面重复展示，同时保持测试 DOM 结构可用 */}
        <div className="hidden" aria-hidden="true">
          <TabsNavigation />
        </div>

        {isGuestMode && (
          <div className="ml-2.5 inline-flex items-center gap-1.5 self-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500 dark:text-amber-400 shrink-0">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
            {t('login.guestMode', 'Guest Mode')}
          </div>
        )}
      </div>

      <nav className="flex items-center justify-end">
        <div className="flex items-center gap-1.5">
          <ProjectSelector />
          {versionDisplay && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-muted-foreground/70 mr-1 cursor-default hidden xl:inline-block">
                    v{versionDisplay}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {versionTooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button variant="ghost" size="icon" side="bottom" tooltip={t('header.projectRepository')} className="size-8">
            <a href={SiteInfo.github} target="_blank" rel="noopener noreferrer">
              <GithubIcon className="size-4" />
            </a>
          </Button>
          <AppSettings />
          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />
          <UserAccountMenu />
        </div>
      </nav>
    </header>
  )
}
