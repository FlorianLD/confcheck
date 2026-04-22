import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { parseZips, MAX_ZIP_FILES } from './lib/parseZip.js'
import { runChecks, totalFailures } from './lib/checks/index.js'
import { buildShareUrl, readShareFromUrl, clearShareHash } from './lib/share.js'
import './App.css'

const ENV_COLORS = [
  ['#3b82f6', '#1e3a8a'],
  ['#10b981', '#064e3b'],
  ['#f59e0b', '#78350f'],
  ['#ef4444', '#7f1d1d'],
  ['#a855f7', '#581c87'],
  ['#06b6d4', '#0e4a5b'],
  ['#ec4899', '#831843'],
]

function envColor(envName, allEnvs) {
  const idx = allEnvs.indexOf(envName)
  const [bg, fg] = ENV_COLORS[idx % ENV_COLORS.length]
  return { background: bg, color: '#fff', borderColor: fg }
}

function baseUrl(site, env) {
  if (!site?.site_id || !env) return null
  const host = env.toLowerCase() === 'prod'
    ? `https://admin.eu1.onestock-retail.com`
    : `https://admin.eu1.${env.toLowerCase()}.onestock-retail.com`
  return `${host}/${site.site_id}`
}

function elementHref(site, env, linkPath) {
  const base = baseUrl(site, env)
  if (!base) return null
  return `${base}${linkPath || ''}`
}

function ElementId({ id }) {
  const parts = id.split(' → ')
  const [first, ...rest] = parts
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(first)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable; do nothing */
    }
  }, [first])

  return (
    <span className="element-id">
      <button type="button" className="element-id-clickable" onClick={onCopy} title="Click to copy">
        {first}
      </button>
      {rest.map((part, i) => (
        <span key={i} className="element-id-part">
          <svg className="element-id-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{part}</span>
        </span>
      ))}
      <span className={`element-id-copied ${copied ? 'element-id-copied--visible' : ''}`} aria-hidden="true">copied</span>
    </span>
  )
}

function ShortIdChip({ id }) {
  return <span className="short-id-chip">{id}</span>
}

function EnvPill({ env, allEnvs, href, onToggle, onVisit, count, active = true }) {
  const style = envColor(env, allEnvs)
  const cls = `env-pill ${active ? '' : 'env-pill--off'}`
  const content = (
    <>
      <span className="env-pill-name">{env}</span>
      {count != null && <span className="env-pill-count">{count}</span>}
    </>
  )
  if (href) {
    return (
      <a className={`${cls} env-pill--link`} style={style} href={href} target="_blank" rel="noreferrer" onClick={() => onVisit?.()}>
        {content}
      </a>
    )
  }
  if (onToggle) {
    return (
      <button
        type="button"
        className={`${cls} env-pill--filter`}
        style={style}
        onClick={onToggle}
        aria-pressed={active}
      >
        {content}
      </button>
    )
  }
  return <span className={cls} style={style}>{content}</span>
}

const LAST_VISITED_KEY = 'confcheck:lastVisitedElement'

function ResultsView({ results, allEnvs, site }) {
  const [collapsedCats, setCollapsedCats] = useState(() => new Set())
  const [collapsedTests, setCollapsedTests] = useState(() => new Set())
  const [activeEnvs, setActiveEnvs] = useState(() => new Set(allEnvs))
  const [hideEmptyTests, setHideEmptyTests] = useState(true)
  const [lastVisitedId, setLastVisitedId] = useState(() => {
    try { return localStorage.getItem(LAST_VISITED_KEY) || null } catch { return null }
  })

  useEffect(() => {
    try {
      if (lastVisitedId) localStorage.setItem(LAST_VISITED_KEY, lastVisitedId)
      else localStorage.removeItem(LAST_VISITED_KEY)
    } catch { /* ignore */ }
  }, [lastVisitedId])

  const clearLastVisited = useCallback(() => setLastVisitedId(null), [])

  const [showBackToTop, setShowBackToTop] = useState(false)
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const toggleEnv = useCallback((env) => {
    setActiveEnvs(prev => {
      const next = new Set(prev)
      if (next.has(env)) next.delete(env)
      else next.add(env)
      return next
    })
  }, [])

  const filteredResults = useMemo(() => {
    return results
      .map(cat => ({
        ...cat,
        tests: cat.tests
          .map(t => ({
            ...t,
            failures: t.failures
              .map(f => ({ ...f, envs: f.envs.filter(e => activeEnvs.has(e)) }))
              .filter(f => f.envs.length > 0),
          }))
          .filter(t => !hideEmptyTests || t.failures.length > 0),
      }))
      .filter(cat => !hideEmptyTests || cat.tests.length > 0)
  }, [results, activeEnvs, hideEmptyTests])

  const total = useMemo(() => totalFailures(filteredResults), [filteredResults])
  const grandTotal = useMemo(() => totalFailures(results), [results])

  const perEnv = useMemo(() => {
    const map = Object.fromEntries(allEnvs.map(e => [e, 0]))
    for (const cat of results) {
      for (const t of cat.tests) {
        for (const f of t.failures) {
          for (const e of f.envs) {
            if (map[e] != null) map[e]++
          }
        }
      }
    }
    return map
  }, [results, allEnvs])

  const inAllEnvs = useMemo(() => {
    if (allEnvs.length < 2) return 0
    let n = 0
    for (const cat of results) {
      for (const t of cat.tests) {
        for (const f of t.failures) {
          if (f.envs.length === allEnvs.length) n++
        }
      }
    }
    return n
  }, [results, allEnvs])

  const toggleCat = useCallback((id) => {
    setCollapsedCats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleTest = useCallback((catId, testId) => {
    const key = `${catId}\u0000${testId}`
    setCollapsedTests(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const allCatIds = useMemo(() => filteredResults.map(c => c.id), [filteredResults])
  const allTestKeys = useMemo(
    () => filteredResults.flatMap(c => c.tests.map(t => `${c.id}\u0000${t.id}`)),
    [filteredResults]
  )
  const allCollapsed = allCatIds.length > 0
    && allCatIds.every(id => collapsedCats.has(id))
    && allTestKeys.every(k => collapsedTests.has(k))

  const toggleAll = useCallback(() => {
    if (allCollapsed) {
      setCollapsedCats(new Set())
      setCollapsedTests(new Set())
    } else {
      setCollapsedCats(new Set(allCatIds))
      setCollapsedTests(new Set(allTestKeys))
    }
  }, [allCollapsed, allCatIds, allTestKeys])

  if (grandTotal === 0) {
    return (
      <div className="empty-results">
        <div className="empty-results-icon">✓</div>
        <h2>No configuration mistakes found</h2>
        <p>Checked {allEnvs.length} environment{allEnvs.length === 1 ? '' : 's'}: {allEnvs.join(', ')}</p>
      </div>
    )
  }

  return (
    <div className="results">
      <div className="results-header">
        <div className="results-header-cell results-header-cell--row1-right">
          {site && (site.site_name || site.site_id) && (
            <span className="site-chip">
              {site.site_name && <span className="site-chip-name">{site.site_name}</span>}
              {site.site_id && <span className="site-chip-id">{site.site_id}</span>}
            </span>
          )}
        </div>
        <div className="results-header-cell results-header-cell--row2-left results-title-row">
          <button
            type="button"
            className="collapse-all-btn"
            onClick={toggleAll}
            aria-pressed={allCollapsed}
            aria-label={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            title={allCollapsed ? 'Expand all' : 'Collapse all'}
          >
            <span className={`chevron ${allCollapsed ? 'chevron--collapsed' : ''}`}>▾</span>
            <h2>{total} mistake{total === 1 ? '' : 's'} found</h2>
          </button>
          <label className="hide-empty-toggle">
            <span className="toggle">
              <input
                type="checkbox"
                checked={hideEmptyTests}
                onChange={e => setHideEmptyTests(e.target.checked)}
              />
              <span className="toggle-slider" />
            </span>
            Only show mistakes
          </label>
        </div>
        <div className="results-envs results-header-cell results-header-cell--row2-right">
          {allEnvs.map(e => (
            <EnvPill
              key={e}
              env={e}
              allEnvs={allEnvs}
              active={activeEnvs.has(e)}
              onToggle={() => toggleEnv(e)}
              count={allEnvs.length > 1 ? perEnv[e] : null}
            />
          ))}
          {allEnvs.length > 1 && (
            <span className="results-envs-extra" title="Failures present in every environment">
              <span className="results-envs-extra-value">{inAllEnvs}</span>
              in all envs
            </span>
          )}
        </div>
      </div>
      {activeEnvs.size === 0 ? (
        <div className="empty-results">
          <h2>No environments selected</h2>
          <p>Use an environment filter above to include its results.</p>
        </div>
      ) : filteredResults.map(cat => {
        const catCollapsed = collapsedCats.has(cat.id)
        const catTotal = cat.tests.reduce((n, t) => n + t.failures.length, 0)
        return (
          <section key={cat.id} className="category">
            <button
              type="button"
              className="collapse-toggle category-toggle"
              aria-expanded={!catCollapsed}
              onClick={() => toggleCat(cat.id)}
            >
              <span className={`chevron ${catCollapsed ? 'chevron--collapsed' : ''}`}>▾</span>
              <h3>{cat.label}</h3>
              <span className={`category-count ${catTotal === 0 ? 'category-count--empty' : ''}`}>{catTotal}</span>
            </button>
            {!catCollapsed && cat.tests.map(test => {
              const testKey = `${cat.id}\u0000${test.id}`
              const testCollapsed = collapsedTests.has(testKey)
              return (
                <div key={test.id} className="test">
                  <button
                    type="button"
                    className="collapse-toggle test-toggle"
                    aria-expanded={!testCollapsed}
                    onClick={() => toggleTest(cat.id, test.id)}
                  >
                    <span className={`chevron ${testCollapsed ? 'chevron--collapsed' : ''}`}>▾</span>
                    <h4>
                      {test.shortId && (
                        <ShortIdChip id={test.shortId} />
                      )}
                      {test.label}
                      {test.siteScope && (
                        <span className="site-scope-badge" title={`Site-specific check (${test.siteScope})`}>
                          {test.siteScope}
                        </span>
                      )}
                      {test.fields && test.fields.length > 0 && (
                        <span
                          className="info-icon"
                          tabIndex={0}
                          aria-label="Fields inspected by this check"
                          onClick={e => e.stopPropagation()}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                          <span className="info-tooltip">
                            <span className="info-tooltip-title">Fields inspected</span>
                            {test.fields.map(f => (
                              <code key={f} className="info-tooltip-field">{f}</code>
                            ))}
                          </span>
                        </span>
                      )}
                    </h4>
                    <span className={`test-count ${test.failures.length === 0 ? 'test-count--empty' : ''}`}>{test.failures.length}</span>
                  </button>
                  {!testCollapsed && (
                    <ul>
                      {test.failures.map(f => {
                        const visitedKey = `${cat.id}\u0000${test.id}\u0000${f.elementId}`
                        const isLastVisited = lastVisitedId === visitedKey
                        return (
                          <li key={f.elementId} className={isLastVisited ? 'last-visited' : ''}>
                            <ElementId id={f.elementId} />
                            <span className="element-envs">
                              {isLastVisited && (
                                <button
                                  type="button"
                                  className="last-visited-clear"
                                  onClick={clearLastVisited}
                                  aria-label="Clear last visited marker"
                                  title="Clear last visited marker"
                                >×</button>
                              )}
                              {f.envs.map(e => (
                                <EnvPill
                                  key={e}
                                  env={e}
                                  allEnvs={allEnvs}
                                  href={elementHref(site, e, f.linkPath)}
                                  onVisit={() => setLastVisitedId(visitedKey)}
                                />
                              ))}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
      {showBackToTop && (
        <button
          type="button"
          className="back-to-top"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 15 12 9 18 15" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default function App() {
  const [state, setState] = useState(() => {
    const shared = readShareFromUrl()
    if (shared && shared.allEnvs.length > 0) {
      return {
        status: 'done',
        fileName: 'shared view',
        results: shared.results,
        allEnvs: [...shared.allEnvs].sort(),
        site: shared.site,
      }
    }
    return { status: 'idle' }
  })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    const label = list.length === 1 ? list[0].name : `${list.length} files`
    setState({ status: 'loading', fileName: label })
    try {
      const { envs, site } = await parseZips(list)
      const envNames = Object.keys(envs).sort()
      if (envNames.length === 0) {
        setState({ status: 'error', message: 'No environment data found in the dropped files.' })
        return
      }
      const results = runChecks(envs, site?.site_id)
      setState({ status: 'done', fileName: label, results, allEnvs: envNames, site })
    } catch (err) {
      setState({ status: 'error', message: err.message || String(err) })
    }
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer?.files)
  }, [handleFiles])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const onPickFile = useCallback((e) => {
    handleFiles(e.target.files)
  }, [handleFiles])

  const reset = useCallback(() => {
    setState({ status: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
    clearShareHash()
  }, [])

  const [shareCopied, setShareCopied] = useState(false)
  const shareTimerRef = useRef(null)
  useEffect(() => () => {
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current)
  }, [])
  const onShare = useCallback(async () => {
    if (state.status !== 'done') return
    try {
      const url = buildShareUrl({ results: state.results, allEnvs: state.allEnvs, site: state.site })
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current)
      shareTimerRef.current = setTimeout(() => setShareCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }, [state.status, state.results, state.allEnvs, state.site])

  if (state.status === 'done') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <button type="button" className="app-title" onClick={reset}>
              <h1>Confcheck</h1>
            </button>
            <p className="tagline">Check configuration mistakes across environments</p>
          </div>
          <button
            type="button"
            className="share-btn app-header-share"
            onClick={onShare}
            title="Copy a link that opens this exact view (no zip needed by the recipient)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="share-btn-label">
              <span className="share-btn-label-ghost" aria-hidden="true">Link copied</span>
              <span className="share-btn-label-text">{shareCopied ? 'Link copied' : 'Share view'}</span>
            </span>
          </button>
        </header>
        <main>
          <ResultsView results={state.results} allEnvs={state.allEnvs} site={state.site} />
        </main>
      </div>
    )
  }

  const isLoading = state.status === 'loading'

  return (
    <div className="home-page">
      <h1 className="home-title">
        <svg className="home-title-icon" viewBox="2 3 9 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M10 5H8C6.89543 5 6 5.89543 6 7V9.43845C6 10.3562 5.37541 11.1561 4.48507 11.3787L2.97014 11.7575C2.71765 11.8206 2.71765 12.1794 2.97014 12.2425L4.48507 12.6213C5.37541 12.8439 6 13.6438 6 14.5616V19H10" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span>Confcheck</span>
        <svg className="home-title-icon" viewBox="13 3 9 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M14 19H16C17.1046 19 18 18.1046 18 17V14.5616C18 13.6438 18.6246 12.8439 19.5149 12.6213L21.0299 12.2425C21.2823 12.1794 21.2823 11.8206 21.0299 11.7575L19.5149 11.3787C18.6246 11.1561 18 10.3562 18 9.43845V5H14" stroke="currentColor" strokeWidth="2"/>
        </svg>
      </h1>
      <p className="home-motto">Check configuration mistakes across environments</p>
      <div className="home-cards">
        <div className="home-card">
          <h2 className="home-card-title">Configuration check</h2>
          <p className="home-card-desc">
            Drop one zip per environment. Each zip must contain <code>rulesets</code>, <code>stock_requests</code>, and <code>delivery_configs</code> files.
          </p>
          <div
            className={`folder-drop-zone folder-drop-zone--large${dragOver ? ' dragging' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop zip file"
          >
            <svg className="drop-zone-border" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0.5" y="0.5" width="99" height="99" rx="1.8" ry="4.5"
                fill="none"
                stroke={dragOver ? '#60a5fa' : '#334155'}
                strokeWidth="1"
                strokeDasharray="10 14"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              multiple
              onChange={onPickFile}
              hidden
              aria-label="zip files"
            />
            {isLoading ? (
              <>
                <div className="loading-spinner" />
                <p className="drop-text">Analyzing <strong>{state.fileName}</strong>…</p>
              </>
            ) : (
              <span className="drop-icon" aria-hidden="true">📁</span>
            )}
          </div>
          {state.status === 'error' && (
            <p className="home-warning"><strong>Couldn't analyze the zip:</strong> {state.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
