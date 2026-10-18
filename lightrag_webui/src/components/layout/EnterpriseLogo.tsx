import React from 'react'
import { cn } from '@/lib/utils'

interface EnterpriseLogoProps {
  className?: string
  size?: number
  withText?: boolean
  subtitle?: string
}

export default function EnterpriseLogo({
  className,
  size = 28,
  withText = false,
  subtitle = 'Enterprise Studio'
}: EnterpriseLogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      {/* 现代几何多维知识网络晶体 SVG 标识 */}
      <div
        className="relative flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-emerald-500 p-[1.5px] shadow-sm shadow-indigo-500/20"
        style={{ width: size, height: size }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-background/95 backdrop-blur-xs">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-4/5 h-4/5 text-primary"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 多面体节点连接 */}
            <path
              d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2Z"
              stroke="url(#logo-grad-1)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M12 2V22"
              stroke="url(#logo-grad-2)"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              className="opacity-60"
            />
            <path
              d="M12 12L20 6.5M12 12L4 6.5M12 12L12 22"
              stroke="url(#logo-grad-1)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* 核心知识实体亮点 */}
            <circle cx="12" cy="12" r="2.2" fill="#3b82f6" />
            <circle cx="12" cy="2" r="1.5" fill="#10b981" />
            <circle cx="20" cy="6.5" r="1.5" fill="#6366f1" />
            <circle cx="4" cy="6.5" r="1.5" fill="#6366f1" />
            <circle cx="20" cy="17.5" r="1.5" fill="#10b981" />
            <circle cx="4" cy="17.5" r="1.5" fill="#10b981" />
            <circle cx="12" cy="22" r="1.5" fill="#3b82f6" />
            <defs>
              <linearGradient id="logo-grad-1" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="0.5" stopColor="#3b82f6" />
                <stop offset="1" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="logo-grad-2" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {withText && (
        <div className="flex flex-col min-w-0 leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm xl:text-base tracking-tight text-foreground">
              OmniRAG
            </span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] xl:text-[10px] font-mono font-semibold text-primary">
              PRO
            </span>
          </div>
          <span className="text-[10px] xl:text-xs text-muted-foreground font-medium mt-0.5">
            {subtitle}
          </span>
        </div>
      )}
    </div>
  )
}
