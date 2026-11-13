"""Interactive Evaluation & Project Studio (Eval Studio) Template
Single-page application powered by Vue 3 and Tailwind CSS.
Zero build-step, pure native ES module and reactive components.
"""

def render_eval_studio_html() -> str:
    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eval Studio - 评测与项目工坊</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            50: '#f0fdf4',
                            500: '#22c55e',
                            600: '#16a34a',
                            700: '#15803d',
                        }
                    }
                }
            }
        }
    </script>
    <!-- Vue 3 CDN -->
    <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
    <style>
        [v-cloak] { display: none; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #1e293b; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased selection:bg-brand-500 selection:text-white">
    <div id="app" v-cloak class="flex flex-col min-h-screen">
        <!-- Top Navigation Bar -->
        <header class="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-50 shadow-md">
            <div class="flex items-center space-x-4">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">⚡</div>
                    <div>
                        <span class="font-bold text-sm tracking-wide bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Eval Studio</span>
                        <span class="text-xs text-slate-400 ml-2 hidden sm:inline">评测全链路与项目工坊</span>
                    </div>
                </div>

                <!-- Tabs -->
                <nav class="flex items-center space-x-1 ml-6 bg-slate-950/60 p-1 rounded-lg border border-slate-800 text-xs">
                    <button @click="currentTab = 'projects'" :class="currentTab === 'projects' ? 'bg-slate-800 text-white shadow font-medium' : 'text-slate-400 hover:text-slate-200'" class="px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5">
                        <span>📁</span><span>项目管理</span>
                    </button>
                    <button @click="currentTab = 'testsets'" :class="currentTab === 'testsets' ? 'bg-slate-800 text-white shadow font-medium' : 'text-slate-400 hover:text-slate-200'" class="px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5">
                        <span>📝</span><span>评测集工坊</span>
                    </button>
                    <button @click="currentTab = 'matrix'" :class="currentTab === 'matrix' ? 'bg-slate-800 text-white shadow font-medium' : 'text-slate-400 hover:text-slate-200'" class="px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5">
                        <span>⚔️</span><span>矩阵打擂</span>
                    </button>
                </nav>
            </div>

            <div class="flex items-center space-x-3 text-xs">
                <span class="text-slate-400 flex items-center">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                    活动项目: <strong class="text-slate-200 ml-1">{{ currentProject || '加载中...' }}</strong>
                </span>
                <span class="text-slate-700">|</span>
                <a href="/evalflow" class="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center space-x-1">
                    <span>📊</span><span>EvalFlow 评测大盘</span>
                </a>
                <a href="/webui/" class="text-slate-400 hover:text-slate-200 transition-colors flex items-center space-x-1">
                    <span>🌐</span><span>LightRAG 控制台</span>
                </a>
            </div>
        </header>

        <!-- Main Content Area -->
        <main class="flex-1 max-w-7xl w-full mx-auto p-6">
            <!-- Global Notification Toast -->
            <transition enter-active-class="transform ease-out duration-300 transition" enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2" enter-to-class="translate-y-0 opacity-100 sm:translate-x-0" leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="toast.show" :class="toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-200' : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'" class="fixed bottom-6 right-6 z-50 border px-4 py-3 rounded-lg shadow-xl text-xs flex items-center space-x-2 max-w-md">
                    <span>{{ toast.type === 'error' ? '❌' : '✅' }}</span>
                    <span>{{ toast.message }}</span>
                </div>
            </transition>

            <!-- ===================== TAB 1: 项目空间管理 ===================== -->
            <section v-if="currentTab === 'projects'" class="space-y-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-bold text-slate-100 flex items-center space-x-2">
                            <span>多租户项目工作区</span>
                            <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-normal">共 {{ workspaces.length }} 个项目</span>
                        </h2>
                        <p class="text-xs text-slate-400 mt-1">每个项目具备物理存储隔离、零锁 POSIX CAS 原子版本切换以及在读租约防护。</p>
                    </div>
                    <button @click="openCreateProjectModal" class="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-950/50 transition-all flex items-center space-x-1.5">
                        <span>+</span><span>新建项目</span>
                    </button>
                </div>

                <!-- Workspaces Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div v-for="ws in workspaces" :key="ws.tenant_id + ':' + ws.project_id" :class="ws.is_current ? 'border-emerald-500/50 bg-slate-900/90 shadow-emerald-950/20' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'" class="border rounded-xl p-5 flex flex-col justify-between transition-all shadow-md">
                        <div>
                            <div class="flex items-start justify-between">
                                <div class="space-y-1">
                                    <div class="flex items-center space-x-2">
                                        <h3 class="font-bold text-sm text-slate-200">{{ ws.name }}</h3>
                                        <span v-if="ws.is_current" class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">当前活动</span>
                                    </div>
                                    <p class="text-xs text-slate-400 font-mono">{{ ws.tenant_id }} / {{ ws.project_id }}</p>
                                </div>
                                <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">{{ ws.active_version }}</span>
                            </div>
                            <p class="text-xs text-slate-400 mt-3 line-clamp-2">{{ ws.description || '暂无项目描述' }}</p>
                        </div>

                        <div class="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                            <button v-if="!ws.is_current" @click="switchWorkspace(ws)" class="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                                切换为活动项目 →
                            </button>
                            <span v-else class="text-emerald-500/70 text-xs flex items-center">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>已处于活动中
                            </span>

                            <button @click="promptDeleteProject(ws)" class="text-slate-500 hover:text-rose-400 transition-colors ml-auto" title="安全归档删除">
                                🗑️ 删除
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- ===================== TAB 2: 评测集工坊 (DeepEval) ===================== -->
            <section v-if="currentTab === 'testsets'" class="space-y-6">
                <!-- Top Action Bar -->
                <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center space-x-3">
                            <label class="text-xs text-slate-400 font-medium">选择题库:</label>
                            <select v-model="selectedDatasetName" @change="loadDatasetDetail" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition-colors min-w-[240px]">
                                <option v-for="d in datasetList" :key="d.name" :value="d.name">
                                    {{ d.name }} ({{ d.cases_count }} 题)
                                </option>
                            </select>
                            <button @click="loadDatasets" class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors" title="刷新题库">
                                🔄
                            </button>
                        </div>

                        <div class="flex items-center space-x-2.5">
                            <button @click="openSynthesizeModal" class="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md transition-all flex items-center space-x-1.5">
                                <span>⚡</span><span>自动合成题库 (DeepEval)</span>
                            </button>
                            <button @click="addNewCase" class="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center space-x-1">
                                <span>+</span><span>手动加题</span>
                            </button>
                            <button @click="saveDatasetChanges" :disabled="isSavingDataset || !currentDataset" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs shadow-md transition-all flex items-center space-x-1.5">
                                <span>💾</span><span>{{ isSavingDataset ? '保存中...' : '保存修改至磁盘' }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Dataset Lineage Manifest Banner -->
                    <div v-if="currentDataset && currentDataset.corpus_manifest" class="bg-slate-950/80 rounded-lg p-3 border border-slate-800 text-xs grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-300">
                        <div><span class="text-slate-500">签约项目:</span> <strong class="text-slate-200">{{ currentDataset.corpus_manifest.project_id }}</strong></div>
                        <div><span class="text-slate-500">修订版本:</span> <span class="font-mono text-emerald-400">{{ currentDataset.corpus_manifest.revision_id }}</span></div>
                        <div><span class="text-slate-500">入库物理文档:</span> <span class="font-semibold">{{ currentDataset.corpus_manifest.docs ? currentDataset.corpus_manifest.docs.length : 0 }} 篇</span></div>
                        <div class="truncate"><span class="text-slate-500">文档指纹:</span> <span class="font-mono text-[11px] text-slate-400" :title="currentDataset.corpus_manifest.snapshot_hash">{{ currentDataset.corpus_manifest.snapshot_hash || '—' }}</span></div>
                    </div>
                </div>

                <!-- Questions List (Editable Cards) -->
                <div v-if="currentDataset && currentDataset.cases && currentDataset.cases.length" class="space-y-4">
                    <div v-for="(item, index) in currentDataset.cases" :key="item.test_number || index" class="bg-slate-900/50 border border-slate-800/90 hover:border-slate-700 rounded-xl p-5 shadow-sm transition-all space-y-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                                <span class="w-6 h-6 rounded-md bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center">#{{ index + 1 }}</span>
                                <span :class="getEvolutionBadgeClass(item.evolution_type, item.lifecycle_tag)" class="px-2.5 py-0.5 rounded text-[11px] font-medium border">
                                    {{ getEvolutionLabel(item.evolution_type, item.lifecycle_tag) }}
                                </span>
                                <span v-if="item.test_target" class="text-[11px] text-slate-500 truncate max-w-xs">{{ item.test_target }}</span>
                            </div>
                            <button @click="deleteCase(index)" class="text-slate-500 hover:text-rose-400 text-xs transition-colors flex items-center space-x-1">
                                <span>✕</span><span>删除此题</span>
                            </button>
                        </div>

                        <!-- Editable Fields -->
                        <div class="space-y-2">
                            <div>
                                <label class="text-[11px] font-semibold text-slate-400">❓ 考题 (Question):</label>
                                <textarea v-model="item.question" rows="2" class="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-emerald-500 transition-colors resize-y leading-relaxed font-sans"></textarea>
                            </div>
                            <div>
                                <label class="text-[11px] font-semibold text-slate-400">🎯 期望答案 (Ground Truth):</label>
                                <textarea v-model="item.ground_truth" rows="3" class="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-emerald-500 transition-colors resize-y leading-relaxed font-sans"></textarea>
                            </div>
                            <div v-if="item.reasoning" class="text-[11px] text-slate-500 bg-slate-950/40 p-2 rounded border border-slate-850">
                                💡 <span class="font-medium text-slate-400">出题考点:</span> {{ item.reasoning }}
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else-if="!isLoadingDataset" class="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
                    <p class="text-sm text-slate-400">当前没有选中题库或题库为空</p>
                    <button @click="openSynthesizeModal" class="mt-3 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors">
                        立即自动合成评测题库 →
                    </button>
                </div>
            </section>

            <!-- ===================== TAB 3: 矩阵打擂启动器 ===================== -->
            <section v-if="currentTab === 'matrix'" class="space-y-6">
                <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
                    <div>
                        <h2 class="text-base font-bold text-slate-100 flex items-center space-x-2">
                            <span>⚔️ 多参数矩阵横向打擂对比 (Matrix Battle)</span>
                        </h2>
                        <p class="text-xs text-slate-400 mt-1">在同一份题库上并发/串行触发不同检索模式与超参数，检验图谱与向量双驱的真实增益并自动上报 MLflow 对比大屏。</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Configurations -->
                        <div class="space-y-4">
                            <div>
                                <label class="text-xs font-medium text-slate-300">评测目标项目:</label>
                                <select v-model="matrixForm.projectId" class="w-full mt-1.5 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition-colors">
                                    <option v-for="ws in workspaces" :key="ws.project_id" :value="ws.project_id">{{ ws.name }} ({{ ws.project_id }})</option>
                                </select>
                            </div>

                            <div>
                                <label class="text-xs font-medium text-slate-300">选择评测题库:</label>
                                <select v-model="matrixForm.dataset" class="w-full mt-1.5 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition-colors">
                                    <option v-for="d in datasetList" :key="d.name" :value="d.name">{{ d.name }} ({{ d.cases_count }} 题)</option>
                                </select>
                            </div>

                            <div>
                                <label class="text-xs font-medium text-slate-300">打擂检索模式 (多选勾选):</label>
                                <div class="grid grid-cols-2 gap-2 mt-1.5">
                                    <label class="flex items-center space-x-2 bg-slate-950 border border-slate-800 p-2.5 rounded-lg cursor-pointer hover:border-slate-700 text-xs">
                                        <input type="checkbox" value="mix" v-model="matrixForm.modes" class="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0">
                                        <span class="font-medium text-slate-200">mix <span class="text-slate-500 text-[10px]">(图谱+向量双驱)</span></span>
                                    </label>
                                    <label class="flex items-center space-x-2 bg-slate-950 border border-slate-800 p-2.5 rounded-lg cursor-pointer hover:border-slate-700 text-xs">
                                        <input type="checkbox" value="naive" v-model="matrixForm.modes" class="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0">
                                        <span class="font-medium text-slate-200">naive <span class="text-slate-500 text-[10px]">(传统纯向量基线)</span></span>
                                    </label>
                                    <label class="flex items-center space-x-2 bg-slate-950 border border-slate-800 p-2.5 rounded-lg cursor-pointer hover:border-slate-700 text-xs">
                                        <input type="checkbox" value="hybrid" v-model="matrixForm.modes" class="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0">
                                        <span class="font-medium text-slate-200">hybrid</span>
                                    </label>
                                    <label class="flex items-center space-x-2 bg-slate-950 border border-slate-800 p-2.5 rounded-lg cursor-pointer hover:border-slate-700 text-xs">
                                        <input type="checkbox" value="local" v-model="matrixForm.modes" class="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0">
                                        <span class="font-medium text-slate-200">local</span>
                                    </label>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="text-xs font-medium text-slate-300">KG Top-K 召回候选数:</label>
                                    <input type="number" v-model.number="matrixForm.topK" class="w-full mt-1.5 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition-colors">
                                </div>
                                <div>
                                    <label class="text-xs font-medium text-slate-300">评测题数上限 (0为全量):</label>
                                    <input type="number" v-model.number="matrixForm.limit" class="w-full mt-1.5 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition-colors">
                                </div>
                            </div>

                            <div class="pt-2">
                                <button @click="startMatrixBattle" :disabled="isMatrixRunning || matrixForm.modes.length === 0" class="w-full py-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center space-x-2">
                                    <span>🚀</span><span>{{ isMatrixRunning ? '打擂任务后台运行中...' : '启动矩阵横向打擂评测' }}</span>
                                </button>
                            </div>
                        </div>

                        <!-- Live Console & Results -->
                        <div class="flex flex-col space-y-3">
                            <div class="flex items-center justify-between text-xs">
                                <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
                                    <span class="w-2 h-2 rounded-full" :class="isMatrixRunning ? 'bg-amber-400 animate-ping' : 'bg-slate-600'"></span>
                                    <span>打擂终端日志:</span>
                                </span>
                                <span v-if="matrixTaskStatus" class="font-mono text-slate-400">状态: {{ matrixTaskStatus }}</span>
                            </div>

                            <div class="flex-1 bg-black/90 border border-slate-800 rounded-xl p-4 font-mono text-[11px] text-emerald-400/90 overflow-y-auto max-h-[360px] min-h-[240px] leading-relaxed select-text space-y-1">
                                <div v-if="matrixLogs.length === 0" class="text-slate-600 italic">点击左侧“启动矩阵打擂”后，此处将实时流式展示各模式得分及推理证据链...</div>
                                <div v-for="(log, i) in matrixLogs" :key="i" class="break-all">{{ log }}</div>
                            </div>

                            <!-- Success Banner with Direct Compare Link -->
                            <div v-if="matrixCompareUrl" class="bg-gradient-to-r from-emerald-950/80 to-cyan-950/80 border border-emerald-500/50 rounded-xl p-4 flex items-center justify-between shadow-xl">
                                <div>
                                    <h4 class="font-bold text-xs text-emerald-300 flex items-center space-x-1.5">
                                        <span>🏆</span><span>打擂完成！各模式指标已全量落库</span>
                                    </h4>
                                    <p class="text-[11px] text-slate-400 mt-0.5">快前往 MLflow 观察平行坐标图、召回率差异与用例大表</p>
                                </div>
                                <a :href="matrixCompareUrl" target="_blank" class="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center space-x-1">
                                    <span>🔥 直达 MLflow 对比大屏 →</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>

        <!-- ===================== MODALS ===================== -->

        <!-- 1. Modal: Create Project -->
        <div v-if="modals.createProject" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-sm text-slate-100">新建项目工作区</h3>
                    <button @click="modals.createProject = false" class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
                </div>
                <div class="space-y-3 text-xs">
                    <div>
                        <label class="text-slate-400 font-medium">租户 ID (Tenant):</label>
                        <input type="text" v-model="newProjectForm.tenant_id" placeholder="__default" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500">
                    </div>
                    <div>
                        <label class="text-slate-400 font-medium">项目英文标识 (Project ID): <span class="text-rose-400">*</span></label>
                        <input type="text" v-model="newProjectForm.project_id" placeholder="如 my_rag_kb" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500">
                        <span class="text-[10px] text-slate-500">只允许字母、数字、下划线与中划线</span>
                    </div>
                    <div>
                        <label class="text-slate-400 font-medium">项目显示名称: <span class="text-rose-400">*</span></label>
                        <input type="text" v-model="newProjectForm.name" placeholder="如 业务知识问答库" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500">
                    </div>
                    <div>
                        <label class="text-slate-400 font-medium">项目描述:</label>
                        <textarea v-model="newProjectForm.description" rows="2" placeholder="项目简介..." class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500 resize-none"></textarea>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 pt-2">
                    <button @click="modals.createProject = false" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs">取消</button>
                    <button @click="submitCreateProject" :disabled="isCreatingProject" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md">
                        {{ isCreatingProject ? '创建中...' : '确认创建' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 2. Modal: Synthesize Testset -->
        <div v-if="modals.synthesize" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-sm text-slate-100 flex items-center space-x-2">
                        <span>⚡ 自动合成评测题库 (DeepEval)</span>
                    </h3>
                    <button @click="modals.synthesize = false" class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
                </div>

                <div v-if="!isSynthesizing" class="space-y-4 text-xs">
                    <div>
                        <label class="text-slate-300 font-medium">源项目 (提取已入库切片):</label>
                        <select v-model="synthForm.projectId" class="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200">
                            <option v-for="ws in workspaces" :key="ws.project_id" :value="ws.project_id">{{ ws.name }} ({{ ws.project_id }})</option>
                        </select>
                    </div>

                    <div>
                        <label class="text-slate-300 font-medium">出题总数量:</label>
                        <div class="flex items-center space-x-3 mt-1.5">
                            <input type="range" min="2" max="20" v-model.number="synthForm.size" class="flex-1 accent-emerald-500">
                            <span class="w-12 text-center font-bold text-emerald-400 bg-slate-950 border border-slate-800 py-1 rounded">{{ synthForm.size }} 题</span>
                        </div>
                    </div>

                    <!-- Incremental CRUD Checkbox -->
                    <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <label class="flex items-start space-x-2.5 cursor-pointer">
                            <input type="checkbox" v-model="synthForm.incremental" class="mt-0.5 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0">
                            <div class="space-y-0.5">
                                <span class="font-semibold text-slate-200">开启全生命周期增删改差量探测 (CRUD)</span>
                                <p class="text-[11px] text-slate-400 leading-normal">
                                    • <strong>新增切片</strong>：出新题，并与老知识交织生成多跳考题；<br>
                                    • <strong>修改切片</strong>：标记受损老题并触发 LLM 重审；<br>
                                    • <strong>删除文档</strong>：自动转为华为 RGB 负样本拒答考题，严惩幻觉！
                                </p>
                            </div>
                        </label>
                        <div v-if="synthForm.incremental" class="pt-2 border-t border-slate-850">
                            <label class="text-[11px] text-slate-400">选择对比的基准题库:</label>
                            <select v-model="synthForm.baseDataset" class="w-full mt-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200 text-xs">
                                <option v-for="d in datasetList" :key="d.name" :value="d.name">{{ d.name }}</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label class="text-slate-300 font-medium">保存目标题库名称:</label>
                        <input type="text" v-model="synthForm.outputName" placeholder="如 lineage_benchmark_v3.json" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200">
                    </div>
                </div>

                <!-- Running Progress View -->
                <div v-else class="space-y-4 py-4 text-xs">
                    <div class="flex items-center justify-between">
                        <span class="text-slate-300 font-medium flex items-center">
                            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping mr-2"></span>
                            正在合成题库中...
                        </span>
                        <span class="font-mono text-emerald-400">{{ synthProgress }}%</span>
                    </div>
                    <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 transition-all duration-300" :style="{ width: synthProgress + '%' }"></div>
                    </div>
                    <div class="bg-black/90 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-400 max-h-40 overflow-y-auto space-y-1">
                        <div v-for="(l, i) in synthLogs" :key="i">{{ l }}</div>
                    </div>
                </div>

                <div class="flex justify-end space-x-2 pt-2">
                    <button v-if="!isSynthesizing" @click="modals.synthesize = false" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs">取消</button>
                    <button v-if="!isSynthesizing" @click="submitSynthesize" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md">
                        启动后台生成
                    </button>
                    <button v-if="isSynthesizing && synthProgress === 100" @click="modals.synthesize = false" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs">
                        完成并关闭
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- App Logic -->
    <script>
        const { createApp, ref, reactive, onMounted } = Vue;

        createApp({
            setup() {
                const currentTab = ref('projects');
                const currentProject = ref('');
                const workspaces = ref([]);
                const datasetList = ref([]);
                const selectedDatasetName = ref('');
                const currentDataset = ref(null);
                const isLoadingDataset = ref(false);
                const isSavingDataset = ref(false);

                // Toast
                const toast = reactive({ show: false, message: '', type: 'success' });
                const showToast = (message, type = 'success') => {
                    toast.message = message;
                    toast.type = type;
                    toast.show = true;
                    setTimeout(() => { toast.show = false; }, 3500);
                };

                // Modals
                const modals = reactive({
                    createProject: false,
                    synthesize: false,
                });

                // Create Project Form
                const isCreatingProject = ref(false);
                const newProjectForm = reactive({
                    tenant_id: '__default',
                    project_id: '',
                    name: '',
                    description: ''
                });

                // Synthesize Form
                const isSynthesizing = ref(false);
                const synthProgress = ref(0);
                const synthLogs = ref([]);
                const synthForm = reactive({
                    projectId: '',
                    size: 4,
                    incremental: false,
                    baseDataset: '',
                    outputName: 'synthesized_testset.json'
                });

                // Matrix Form & Live Battle
                const isMatrixRunning = ref(false);
                const matrixTaskStatus = ref('');
                const matrixLogs = ref([]);
                const matrixCompareUrl = ref('');
                const matrixForm = reactive({
                    projectId: '',
                    dataset: '',
                    modes: ['mix', 'naive'],
                    topK: 40,
                    limit: 1
                });

                // 1. Load Workspaces
                const loadWorkspaces = async () => {
                    try {
                        const res = await fetch('/ops/workspaces');
                        const data = await res.json();
                        workspaces.value = data.workspaces || [];
                        const active = workspaces.value.find(w => w.is_current);
                        if (active) {
                            currentProject.value = active.project_id;
                            synthForm.projectId = active.project_id;
                            matrixForm.projectId = active.project_id;
                        }
                    } catch (e) {
                        showToast('加载工作区失败: ' + e.message, 'error');
                    }
                };

                // Switch Workspace
                const switchWorkspace = async (ws) => {
                    try {
                        const res = await fetch('/ops/workspaces/select', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tenant_id: ws.tenant_id, project_id: ws.project_id })
                        });
                        const data = await res.json();
                        if (data.status === 'success') {
                            showToast(`已切换至活动项目: ${ws.name}`);
                            await loadWorkspaces();
                        } else {
                            showToast(data.message || '切换失败', 'error');
                        }
                    } catch (e) {
                        showToast('切换请求异常: ' + e.message, 'error');
                    }
                };

                // Create Project
                const openCreateProjectModal = () => {
                    newProjectForm.project_id = '';
                    newProjectForm.name = '';
                    newProjectForm.description = '';
                    modals.createProject = true;
                };

                const submitCreateProject = async () => {
                    if (!newProjectForm.project_id || !newProjectForm.name) {
                        showToast('请完整填写项目标识与显示名称', 'error');
                        return;
                    }
                    isCreatingProject.value = true;
                    try {
                        const res = await fetch('/ops/workspaces', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newProjectForm)
                        });
                        const data = await res.json();
                        if (res.ok) {
                            showToast(`项目 ${data.name} 显式创建成功！`);
                            modals.createProject = false;
                            await loadWorkspaces();
                        } else {
                            showToast(data.detail || '创建失败', 'error');
                        }
                    } catch (e) {
                        showToast('网络请求异常: ' + e.message, 'error');
                    } finally {
                        isCreatingProject.value = false;
                    }
                };

                // Prompt Delete Project
                const promptDeleteProject = async (ws) => {
                    if (ws.is_current) {
                        showToast('当前活动项目正在运行中，无法直接删除，请先切换至其他项目！', 'error');
                        return;
                    }
                    const confirmed = confirm(`⚠️ 危险操作确认！\\n\\n确定要安全归档删除项目【${ws.name} (${ws.project_id})】吗？\\n物理文件将被原子移入冷归档目录（.trash），读租约将进行排空校验。`);
                    if (!confirmed) return;

                    try {
                        const res = await fetch(`/ops/workspaces/${ws.tenant_id}/${ws.project_id}`, {
                            method: 'DELETE'
                        });
                        const data = await res.json();
                        if (res.ok) {
                            showToast(`项目已安全归档至冷存储！`);
                            await loadWorkspaces();
                        } else {
                            showToast(data.detail || '删除失败', 'error');
                        }
                    } catch (e) {
                        showToast('删除请求异常: ' + e.message, 'error');
                    }
                };

                // 2. Load Datasets
                const loadDatasets = async () => {
                    try {
                        const res = await fetch('/ops/evaluation/datasets');
                        const data = await res.json();
                        datasetList.value = data.datasets || [];
                        if (datasetList.value.length && !selectedDatasetName.value) {
                            selectedDatasetName.value = datasetList.value[0].name;
                            synthForm.baseDataset = datasetList.value[0].name;
                            matrixForm.dataset = datasetList.value[0].name;
                            await loadDatasetDetail();
                        }
                    } catch (e) {
                        showToast('加载题库列表失败: ' + e.message, 'error');
                    }
                };

                const loadDatasetDetail = async () => {
                    if (!selectedDatasetName.value) return;
                    isLoadingDataset.value = true;
                    try {
                        const res = await fetch(`/ops/evaluation/datasets/${selectedDatasetName.value}`);
                        const data = await res.json();
                        currentDataset.value = data;
                        matrixForm.dataset = selectedDatasetName.value;
                    } catch (e) {
                        showToast('加载题库详情失败: ' + e.message, 'error');
                    } finally {
                        isLoadingDataset.value = false;
                    }
                };

                const addNewCase = () => {
                    if (!currentDataset.value) return;
                    if (!currentDataset.value.cases) currentDataset.value.cases = [];
                    currentDataset.value.cases.unshift({
                        test_number: currentDataset.value.cases.length + 1,
                        evolution_type: 'custom_manual',
                        question: '请输入自定义测试问题...',
                        ground_truth: '请输入标准参考答案...',
                        reasoning: '用户手动新增的边界考点'
                    });
                    showToast('已在题库顶部新增测试题，编辑后记得点击保存！');
                };

                const deleteCase = (index) => {
                    if (!currentDataset.value || !currentDataset.value.cases) return;
                    currentDataset.value.cases.splice(index, 1);
                    showToast('已移除该题，记得点击保存修改！');
                };

                const saveDatasetChanges = async () => {
                    if (!currentDataset.value || !selectedDatasetName.value) return;
                    isSavingDataset.value = true;
                    try {
                        const res = await fetch(`/ops/evaluation/datasets/${selectedDatasetName.value}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(currentDataset.value)
                        });
                        const data = await res.json();
                        if (res.ok) {
                            showToast(`题库 ${selectedDatasetName.value} 已成功保存回盘！`);
                            await loadDatasets();
                        } else {
                            showToast(data.detail || '保存失败', 'error');
                        }
                    } catch (e) {
                        showToast('保存请求异常: ' + e.message, 'error');
                    } finally {
                        isSavingDataset.value = false;
                    }
                };

                const getEvolutionLabel = (type, tag) => {
                    if (tag === 'REFUSAL_NEGATIVE' || type === 'refusal_verification') return '🛡️ 负样本拒答题';
                    if (type === 'multi_hop') return '🔗 跨文档多跳题';
                    if (type === 'custom_manual') return '✏️ 手工自定义';
                    return '📄 单切片基础题';
                };

                const getEvolutionBadgeClass = (type, tag) => {
                    if (tag === 'REFUSAL_NEGATIVE' || type === 'refusal_verification') {
                        return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
                    }
                    if (type === 'multi_hop') {
                        return 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400';
                    }
                    if (type === 'custom_manual') {
                        return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
                    }
                    return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
                };

                // Synthesize
                const openSynthesizeModal = () => {
                    synthForm.outputName = `lineage_benchmark_${Date.now().toString().slice(-4)}.json`;
                    isSynthesizing.value = false;
                    synthProgress.value = 0;
                    synthLogs.value = [];
                    modals.synthesize = true;
                };

                const submitSynthesize = async () => {
                    isSynthesizing.value = true;
                    synthProgress.value = 10;
                    synthLogs.value = ['正在启动后台 DeepEval 题库合成任务...'];

                    try {
                        const res = await fetch('/ops/evaluation/datasets/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                project_id: synthForm.projectId,
                                size: synthForm.size,
                                incremental: synthForm.incremental,
                                base_dataset: synthForm.incremental ? synthForm.baseDataset : null,
                                output_name: synthForm.outputName
                            })
                        });
                        const data = await res.json();
                        if (!res.ok) {
                            showToast(data.detail || '启动失败', 'error');
                            isSynthesizing.value = false;
                            return;
                        }

                        const taskId = data.task_id;
                        const pollInterval = setInterval(async () => {
                            try {
                                const pollRes = await fetch(`/ops/evaluation/tasks/${taskId}`);
                                const task = await pollRes.json();
                                synthProgress.value = task.progress || synthProgress.value;
                                synthLogs.value = task.logs || [];

                                if (task.status === 'completed') {
                                    clearInterval(pollInterval);
                                    synthProgress.value = 100;
                                    showToast('题库自动合成圆满完成！');
                                    await loadDatasets();
                                    selectedDatasetName.value = synthForm.outputName;
                                    await loadDatasetDetail();
                                } else if (task.status === 'failed') {
                                    clearInterval(pollInterval);
                                    showToast('合成任务失败: ' + task.error, 'error');
                                }
                            } catch (err) {
                                console.error('Poll error', err);
                            }
                        }, 2000);

                    } catch (e) {
                        showToast('合成接口异常: ' + e.message, 'error');
                        isSynthesizing.value = false;
                    }
                };

                // 3. Matrix Battle
                const startMatrixBattle = async () => {
                    if (matrixForm.modes.length === 0) {
                        showToast('请至少选择一种检索模式进行打擂！', 'error');
                        return;
                    }
                    isMatrixRunning.value = true;
                    matrixLogs.value = ['正在启动 LightRAG 参数矩阵打擂任务...'];
                    matrixTaskStatus.value = 'RUNNING';
                    matrixCompareUrl.value = '';

                    try {
                        const res = await fetch('/ops/evaluation/matrix-run', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                project_id: matrixForm.projectId,
                                dataset: matrixForm.dataset,
                                matrix_mode: matrixForm.modes,
                                top_k: matrixForm.topK,
                                limit: matrixForm.limit,
                                mlflow: true
                            })
                        });
                        const data = await res.json();
                        if (!res.ok) {
                            showToast(data.detail || '打擂启动失败', 'error');
                            isMatrixRunning.value = false;
                            return;
                        }

                        const taskId = data.task_id;
                        const pollInterval = setInterval(async () => {
                            try {
                                const pollRes = await fetch(`/ops/evaluation/tasks/${taskId}`);
                                const task = await pollRes.json();
                                matrixTaskStatus.value = task.status;
                                matrixLogs.value = task.logs || [];

                                if (task.status === 'completed') {
                                    clearInterval(pollInterval);
                                    isMatrixRunning.value = false;
                                    matrixCompareUrl.value = task.result_url || '';
                                    showToast('打擂横向对比评测全量执行完毕！');
                                } else if (task.status === 'failed') {
                                    clearInterval(pollInterval);
                                    isMatrixRunning.value = false;
                                    showToast('打擂任务执行失败: ' + task.error, 'error');
                                }
                            } catch (err) {
                                console.error('Poll error', err);
                            }
                        }, 2500);

                    } catch (e) {
                        showToast('打擂接口异常: ' + e.message, 'error');
                        isMatrixRunning.value = false;
                    }
                };

                onMounted(async () => {
                    await loadWorkspaces();
                    await loadDatasets();
                });

                return {
                    currentTab,
                    currentProject,
                    workspaces,
                    datasetList,
                    selectedDatasetName,
                    currentDataset,
                    isLoadingDataset,
                    isSavingDataset,
                    toast,
                    modals,
                    newProjectForm,
                    isCreatingProject,
                    synthForm,
                    isSynthesizing,
                    synthProgress,
                    synthLogs,
                    matrixForm,
                    isMatrixRunning,
                    matrixTaskStatus,
                    matrixLogs,
                    matrixCompareUrl,
                    switchWorkspace,
                    openCreateProjectModal,
                    submitCreateProject,
                    promptDeleteProject,
                    loadDatasets,
                    loadDatasetDetail,
                    addNewCase,
                    deleteCase,
                    saveDatasetChanges,
                    getEvolutionLabel,
                    getEvolutionBadgeClass,
                    openSynthesizeModal,
                    submitSynthesize,
                    startMatrixBattle,
                };
            }
        }).mount('#app');
    </script>
</body>
</html>
"""
