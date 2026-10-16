import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/state'
import { navigationService } from '@/services/navigation'
import { ChevronDown, LogOut, User, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function UserAccountMenu() {
  const { username, isGuestMode } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayName = username || (isGuestMode ? 'Guest' : 'admin')
  const initials = displayName.slice(0, 2).toUpperCase()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleLogout = () => {
    document.cookie = 'LIGHTRAG-API-TOKEN=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    navigationService.navigateToUnauthenticated()
  }

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex items-center gap-2 px-2.5 py-1 text-sm font-medium rounded-md transition-colors',
          'hover:bg-muted/70 text-foreground cursor-pointer focus:outline-none'
        )}
      >
        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white font-bold text-xs flex items-center justify-center shadow-sm select-none">
          {initials}
        </div>
        <span className="font-medium text-sm hidden sm:inline-block">{displayName}</span>
        <ChevronDown className={cn('size-3 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl z-50 py-1.5 text-popover-foreground animate-in fade-in-0 zoom-in-95">
          {/* User info overview */}
          <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-bold text-sm flex items-center justify-center shadow-sm shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate text-foreground">{displayName}</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="size-3 text-emerald-500" />
                {isGuestMode ? '访客身份' : '平台管理员'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
