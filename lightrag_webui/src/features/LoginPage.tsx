import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/state'
import { activateLoginIdentityFromToken } from '@/lib/loginIdentity'
import { markVersionCheckedFromLogin } from '@/lib/versionCheckCache'
import { loginToServer, getAuthStatus, exchangeSsoTicket } from '@/api/lightrag'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import { ScrollArea } from '@/components/ui/ScrollArea'
import AppSettings from '@/components/AppSettings'
import CustomizedMarkdown from '@/components/customization/CustomizedMarkdown'
import CustomizedCopyright from '@/components/customization/CustomizedCopyright'
import { useCustomizedContent } from '@/components/customization/useCustomizedContent'
import {
  CONSENT_LABEL_MARKER,
  isAgreedTo,
  isLoginBlockedByConsent,
  resolveConsentDocuments,
  shouldShowLoginConsent,
  splitConsentLabel,
  type LoginConsentTick
} from '@/features/loginConsent'
import { User, Lock, Eye, EyeOff, Network, Sparkles, Layers, ShieldCheck } from 'lucide-react'
import EnterpriseLogo from '@/components/layout/EnterpriseLogo'

interface LoginPageProps {
  autoActivateGuest?: boolean
}

const LoginPage = ({ autoActivateGuest = true }: LoginPageProps) => {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [authStatusTitle, setAuthStatusTitle] = useState<string | null>(null)
  const [consentTick, setConsentTick] = useState<LoginConsentTick>({
    document: null,
    agreed: false
  })
  const [agreementsOpen, setAgreementsOpen] = useState(false)
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null)
  const authCheckRef = useRef(false)

  const content = useCustomizedContent(authStatusTitle)
  const consentAgreed = isAgreedTo(consentTick, content.agreementsMarkdown)
  const consentState = {
    pending: content.consentPending,
    consentRequired: content.consentRequired,
    agreed: consentAgreed
  }
  const showConsent = shouldShowLoginConsent(consentState)
  const consentBlocked = isLoginBlockedByConsent(consentState)
  const consentDocuments = resolveConsentDocuments(
    content.consentDocuments,
    t('login.consentDocuments')
  )
  const consentLabelText = t('login.consentLabel', { documents: consentDocuments })
  const consentLabelParts = splitConsentLabel(
    t('login.consentLabel', { documents: CONSENT_LABEL_MARKER })
  )

  const customLogoActive = Boolean(content.logoUrl && failedLogoUrl !== content.logoUrl)

  useEffect(() => {
    document.title = '登录 - OmniRAG Enterprise Studio'
  }, [])

  useEffect(() => {
    const checkAuthConfig = async () => {
      if (authCheckRef.current) return
      authCheckRef.current = true

      try {
        if (isAuthenticated) {
          navigate('/')
          return
        }

        // Automatic SSO Ticket Exchange
        const searchStr = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '')
        const urlParams = new URLSearchParams(searchStr)
        const ssoTicket = urlParams.get('sso_ticket') || urlParams.get('ticket')
        if (ssoTicket) {
          try {
            const exchangeRes = await exchangeSsoTicket(ssoTicket)
            if (exchangeRes.access_token) {
              activateLoginIdentityFromToken(exchangeRes.access_token)
              login(
                exchangeRes.access_token,
                false,
                exchangeRes.core_version,
                exchangeRes.api_version,
                exchangeRes.webui_title || null,
                exchangeRes.webui_description || null
              )
              const cleanUrl = window.location.pathname + window.location.hash.split('?')[0]
              window.history.replaceState({}, document.title, cleanUrl)
              toast.success(t('login.successMessage', '登录成功'))
              navigate('/')
              return
            }
          } catch (ticketErr) {
            console.error('SSO ticket exchange failed:', ticketErr)
            toast.error(t('login.errorSsoTicketInvalid', '免密登录票据已失效，请重新登录'))
          }
        }

        const status = await getAuthStatus()
        setAuthStatusTitle(status.webui_title || null)

        if (status.core_version || status.api_version) {
          markVersionCheckedFromLogin()
        }

        if (!status.auth_configured && status.access_token) {
          if (!autoActivateGuest) {
            navigate('/welcome', { replace: true })
            return
          }
          const isGuestMode = status.auth_mode === 'disabled'
          login(status.access_token, isGuestMode, status.core_version, status.api_version, status.webui_title || null, status.webui_description || null)
          navigate('/')
          return
        }

        setCheckingAuth(false)
      } catch (error) {
        console.error('Failed to check auth configuration:', error)
        setCheckingAuth(false)
      }
    }

    checkAuthConfig()
  }, [isAuthenticated, login, navigate, autoActivateGuest, t])

  if (checkingAuth || content.loading) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center bg-slate-50 text-slate-600 transition-colors duration-200 dark:bg-[#070b14] dark:text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-slate-500 dark:text-slate-400">正在初始化系统环境…</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error(t('login.errorEmptyFields'))
      return
    }
    if (consentBlocked) {
      toast.error(t('login.errorConsentRequired'))
      return
    }

    try {
      setLoading(true)
      const response = await loginToServer(username, password)

      activateLoginIdentityFromToken(response.access_token)
      const isGuestMode = response.auth_mode === 'disabled'
      login(response.access_token, isGuestMode, response.core_version, response.api_version, response.webui_title || null, response.webui_description || null)

      if (response.core_version || response.api_version) {
        markVersionCheckedFromLogin()
      }

      if (isGuestMode) {
        toast.info(response.message || t('login.authDisabled', 'Authentication is disabled. Using guest access.'))
      } else {
        toast.success(t('login.successMessage'))
      }

      navigate('/')
    } catch (error: any) {
      console.error('Login failed...', error)
      const errorDetail = error?.response?.data?.detail || ''
      if (error?.response?.status === 503 || errorDetail.includes('unavailable')) {
        toast.error('主平台身份认证服务暂不可用，请稍后重试')
      } else {
        toast.error(t('login.errorInvalidCredentials', '用户名或密码错误'))
      }

      useAuthStore.getState().logout()
      localStorage.removeItem('LIGHTRAG-API-TOKEN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-[#070b14] dark:text-slate-100"
      style={{
        padding: 'calc(env(safe-area-inset-top) + 1.5rem) calc(env(safe-area-inset-right) + 1.5rem) calc(env(safe-area-inset-bottom) + 1.5rem) calc(env(safe-area-inset-left) + 1.5rem)'
      }}
    >
      {/* Ambient Radial Glowing Lights */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.07] blur-[120px] dark:bg-emerald-500/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-1/4 h-[450px] w-[450px] rounded-full bg-teal-500/[0.07] blur-[130px] dark:bg-teal-500/10"
      />

      {/* Cyber Dot Grid Pattern Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-20 [background-image:radial-gradient(rgba(100,116,139,0.18)_1px,transparent_1px)] dark:[background-image:radial-gradient(rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]"
      />

      {/* Top Right Controls */}
      <div
        className="absolute z-20 flex items-center gap-2"
        style={{
          top: 'calc(env(safe-area-inset-top) + 1.25rem)',
          right: 'calc(env(safe-area-inset-right) + 1.25rem)'
        }}
      >
        <AppSettings className="rounded-lg border border-slate-200/90 bg-white/80 p-1.5 text-slate-700 shadow-xs backdrop-blur-md transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white" />
      </div>

      {/* Main Dual-Panel Layout Container */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-4 lg:grid-cols-12 lg:gap-14">
        {/* Left Side: Brand Narrative & Knowledge Graph Architecture */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          {/* Brand Header */}
          <div className="flex items-center gap-3">
            {customLogoActive ? (
              <img
                src={content.logoUrl!}
                alt={content.logoAlt || content.brandTitle || 'Logo'}
                className="h-10 w-auto max-w-[160px] object-contain"
                onError={() => setFailedLogoUrl(content.logoUrl)}
              />
            ) : (
              <EnterpriseLogo size={38} withText={false} />
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {content.brandTitle && content.brandTitle !== 'LightRAG' ? content.brandTitle : 'OmniRAG'}
              </h1>
              <span className="rounded-md border border-emerald-600/30 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                PRO V1.5.8
              </span>
            </div>
          </div>

          {/* Hero Headline */}
          <div className="space-y-2.5">
            <p className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-400 sm:text-4xl">
              企业级知识图谱增强检索平台
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              融合双层实体图谱拓扑与向量语义空间，突破传统 RAG 检索视野限制，
              提供高可信、精准溯源、低幻觉的企业专家知识库服务。
            </p>
          </div>

          {/* 4 Feature Cards Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                icon: Network,
                title: 'Dual-Level Graph RAG',
                desc: '低阶实体与高阶拓扑双层协同检索'
              },
              {
                icon: Sparkles,
                title: 'Docling 多模态可信定位',
                desc: '高精度版面分析与精准页码溯源'
              },
              {
                icon: Layers,
                title: 'POSIX CAS 零锁原子发布',
                desc: '毫秒级快照发布与平滑读租约排空'
              },
              {
                icon: ShieldCheck,
                title: '三位一体统一凭据',
                desc: '支持 Agent 平台账号穿透与 60s 票据直通'
              }
            ].map((feat) => {
              const IconComp = feat.icon
              return (
                <div
                  key={feat.title}
                  className="group flex items-start gap-3 rounded-xl border border-slate-200/90 bg-white/80 p-3.5 shadow-xs backdrop-blur-sm transition-all duration-200 hover:border-emerald-500/40 hover:bg-white hover:shadow-md dark:border-white/5 dark:bg-slate-900/40 dark:shadow-none dark:hover:border-emerald-500/30 dark:hover:bg-slate-800/50"
                >
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 group-hover:bg-emerald-500/20 dark:text-emerald-400">
                    <IconComp className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{feat.title}</h3>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{feat.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* System Cluster Status */}
          <div className="flex items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] dark:bg-emerald-400 dark:shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>OmniRAG 集群正常运行 · 存储引擎: NanoVectorDB · 版本 v1.5.8</span>
          </div>
        </div>

        {/* Right Side: Modern Glassmorphism Login Card */}
        <div className="w-full lg:col-span-5">
          <Card className="mx-auto w-full max-w-md rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-2xl shadow-slate-200/60 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/60">
            <CardHeader className="space-y-1.5 pb-6 pt-6 text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">OmniRAG 身份认证</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                使用 Agent 平台账号或 OmniRAG 专属凭据直通登入
              </p>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              {content.loginMarkdown && (
                <CustomizedMarkdown
                  content={content.loginMarkdown}
                  dir={content.direction}
                  className="mb-4 text-xs text-slate-600 dark:text-slate-300"
                />
              )}
              <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[340px] space-y-4">
                {/* Username Input */}
                <div className="space-y-1.5">
                  <label htmlFor="username-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('login.username')}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      id="username-input"
                      placeholder={t('login.usernamePlaceholder', '请输入用户名')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="h-11 w-full rounded-lg border-slate-200 bg-slate-50/80 pl-10 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus-visible:bg-white focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/50 dark:text-white dark:placeholder:text-slate-500 dark:focus-visible:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Password Input with Show/Hide Toggle */}
                <div className="space-y-1.5">
                  <label htmlFor="password-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('login.password')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('login.passwordPlaceholder', '请输入密码')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 w-full rounded-lg border-slate-200 bg-slate-50/80 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus-visible:bg-white focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/50 dark:text-white dark:placeholder:text-slate-500 dark:focus-visible:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Consent Gate */}
                {showConsent && (
                  <div className="flex items-start gap-2 pt-1" dir={content.direction}>
                    <Checkbox
                      id="login-consent"
                      checked={consentAgreed}
                      onCheckedChange={(checked) =>
                        setConsentTick({
                          document: content.agreementsMarkdown,
                          agreed: checked === true
                        })
                      }
                      aria-label={consentLabelText}
                      className="mt-0.5 border-slate-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 dark:border-slate-600 dark:data-[state=checked]:bg-emerald-500 dark:data-[state=checked]:border-emerald-500"
                    />
                    <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {consentLabelParts.before && (
                        <label htmlFor="login-consent" className="cursor-pointer">
                          {consentLabelParts.before}
                        </label>
                      )}
                      <button
                        type="button"
                        className="text-emerald-600 underline underline-offset-2 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
                        onClick={() => setAgreementsOpen(true)}
                      >
                        {consentDocuments}
                      </button>
                      {consentLabelParts.after && (
                        <label htmlFor="login-consent" className="cursor-pointer">
                          {consentLabelParts.after}
                        </label>
                      )}
                    </span>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-600/40 active:scale-[0.99] disabled:opacity-50"
                  disabled={loading || consentBlocked}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>{t('login.loggingIn', '正在登录…')}</span>
                    </div>
                  ) : (
                    t('login.loginButton', '登录进入 OmniRAG 知识库')
                  )}
                </Button>
              </form>

              {/* Bottom Security Info */}
              <div className="mt-5 border-t border-slate-200/80 pt-4 text-center dark:border-white/5">
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  OmniRAG Enterprise Studio · 统一认证与访问控制保护中
                </p>
              </div>
            </CardContent>
          </Card>

          <CustomizedCopyright
            copyright={content.copyright}
            direction={content.direction}
            className="pt-3 text-center text-xs text-slate-500 dark:text-slate-500"
          />
        </div>
      </div>

      {/* Consent Dialog */}
      {showConsent && content.agreementsMarkdown && (
        <Dialog open={agreementsOpen} onOpenChange={setAgreementsOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl bg-white text-slate-900 border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-white/10" dir={content.direction}>
            <DialogHeader className="sr-only">
              <DialogTitle>{consentDocuments}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-6">
              <CustomizedMarkdown content={content.agreementsMarkdown} variant="document" />
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default LoginPage
