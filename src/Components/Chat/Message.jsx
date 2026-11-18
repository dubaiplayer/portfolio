import React, { memo } from 'react'
import { Sources } from './Sources'

/**
 * One transcript row.
 *
 * memo'd because during a response only the last message's `content` changes —
 * without it every message re-renders on every update.
 *
 * Text is rendered as plain text with `white-space: pre-wrap`, deliberately.
 * react-markdown plus a sanitiser is ~40KB gzipped for a bot whose system
 * prompt explicitly asks for short plain prose. Rendering model output as
 * markdown/HTML would also be the obvious injection surface.
 */
export const Message = memo(function Message({ message, onNavigate }) {
  const { role, content, sources, status } = message
  const isUser = role === 'user'

  if (status === 'error') return null // the error row is rendered by the panel

  return (
    <div className={`dgchat_msg ${isUser ? 'dgchat_msg_user' : 'dgchat_msg_bot'}`}>
      <div className="dgchat_msg_text">
        {content}
        {status === 'streaming' && content && <span className="dgchat_caret" aria-hidden="true" />}
        {status === 'stopped' && <span className="dgchat_stopped"> — stopped</span>}
      </div>

      {!isUser && status === 'done' && (
        <Sources sources={sources} onNavigate={onNavigate} />
      )}
    </div>
  )
})
