import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { parseZips, MAX_ZIP_FILES } from './lib/parseZip.js'
import { runChecks, totalFailures } from './lib/checks/index.js'
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
    ? `https://www.admin.eu1.onestock-retail.com`
    : `https://www.admin.eu1.${env.toLowerCase()}.onestock-retail.com`
  return `${host}/${site.site_id}`
}

function elementHref(site, env, linkPath) {
  const base = baseUrl(site, env)
  if (!base) return null
  return `${base}${linkPath || ''}`
}

function ElementId({ id }) {
  const parts = id.split(' → ')
  return (
    <span className="element-id">
      {parts.map((part, i) => (
        <span key={i} className="element-id-part">
          {i > 0 && (
            <svg className="element-id-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
          <span>{part}</span>
        </span>
      ))}
    </span>
  )
}

function EnvPill({ env, allEnvs, href, onToggle, onVisit, active = true }) {
  const style = envColor(env, allEnvs)
  const cls = `env-pill ${active ? '' : 'env-pill--off'}`
  if (href) {
    return (
      <a className={`${cls} env-pill--link`} style={style} href={href} target="_blank" rel="noreferrer" onClick={() => onVisit?.()}>
        {env}
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
        {env}
      </button>
    )
  }
  return <span className={cls} style={style}>{env}</span>
}

const LAST_VISITED_KEY = 'confcheck:lastVisitedElement'

function ResultsView({ results, allEnvs, site }) {
  const [collapsedCats, setCollapsedCats] = useState(() => new Set())
  const [collapsedTests, setCollapsedTests] = useState(() => new Set())
  const [activeEnvs, setActiveEnvs] = useState(() => new Set(allEnvs))
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
          .filter(t => t.failures.length > 0),
      }))
      .filter(cat => cat.tests.length > 0)
  }, [results, activeEnvs])

  const total = useMemo(() => totalFailures(filteredResults), [filteredResults])
  const grandTotal = useMemo(() => totalFailures(results), [results])

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
        <button
          type="button"
          className="results-header-left collapse-all-btn"
          onClick={toggleAll}
          aria-pressed={allCollapsed}
          aria-label={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
          title={allCollapsed ? 'Expand all' : 'Collapse all'}
        >
          <span className={`chevron ${allCollapsed ? 'chevron--collapsed' : ''}`}>▾</span>
          <h2>{total} mistake{total === 1 ? '' : 's'} found</h2>
        </button>
        <div className="results-envs">
          {site && (site.site_name || site.site_id) && (
            <span className="site-chip">
              {site.site_name && <span className="site-chip-name">{site.site_name}</span>}
              {site.site_id && <span className="site-chip-id">#{site.site_id}</span>}
            </span>
          )}
          <span className="results-envs-label">across</span>
          {allEnvs.map(e => (
            <EnvPill
              key={e}
              env={e}
              allEnvs={allEnvs}
              active={activeEnvs.has(e)}
              onToggle={() => toggleEnv(e)}
            />
          ))}
        </div>
      </div>
      {activeEnvs.size === 0 ? (
        <div className="empty-results">
          <h2>No environments selected</h2>
          <p>Click an environment pill above to include its results.</p>
        </div>
      ) : null}
      {filteredResults.map(cat => {
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
              <span className="category-count">{catTotal}</span>
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
                      {test.label}
                      {test.siteScope && (
                        <span className="site-scope-badge" title={`Site-specific check (${test.siteScope})`}>
                          {test.siteScope}
                        </span>
                      )}
                    </h4>
                    <span className="test-count">{test.failures.length}</span>
                  </button>
                  {!testCollapsed && (
                    <ul>
                      {test.failures.map(f => {
                        const isLastVisited = lastVisitedId === f.elementId
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
                                  onVisit={() => setLastVisitedId(f.elementId)}
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
    </div>
  )
}

export default function App() {
  const [state, setState] = useState({ status: 'idle' })
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
  }, [])

  if (state.status === 'done') {
    return (
      <div className="app">
        <header className="app-header">
          <button type="button" className="app-title" onClick={reset}>
            <h1>Confcheck</h1>
          </button>
          <p className="tagline">Check configuration mistakes across environments</p>
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
