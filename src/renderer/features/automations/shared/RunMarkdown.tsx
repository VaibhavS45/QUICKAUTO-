import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { parseBlocks, parseInline } from './run-format.js'

function Inline({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.kind === 'code' ? <code key={i} className="rv-inline-code">{part.text}</code>
        : part.kind === 'bold' ? <strong key={i}>{part.text}</strong>
        : <span key={i}>{part.text}</span>)}
    </>
  )
}

function CodeBlock({ lang, code }: { lang: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <figure className="rv-code">
      <figcaption>
        <span>{lang || 'text'}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre><code>{code}</code></pre>
    </figure>
  )
}

/** Renders run output as formatted text. Never uses dangerouslySetInnerHTML. */
export function RunMarkdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="rv-md">
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case 'heading': return <h4 key={i} className={`rv-h${block.level}`}><Inline text={block.text} /></h4>
          case 'code': return <CodeBlock key={i} lang={block.lang} code={block.code} />
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return <Tag key={i}>{block.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}</Tag>
          }
          case 'paragraph': return <p key={i}><Inline text={block.text} /></p>
        }
      })}
    </div>
  )
}
