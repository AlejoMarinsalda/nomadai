import { marked } from 'marked'

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

marked.use({
  renderer: {
    link(href: string, title: string | null | undefined, text: string) {
      const ytId = getYouTubeId(href)
      if (ytId) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="yt-card">` +
          `<div class="yt-thumb-wrap">` +
          `<img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="${text}" class="yt-thumb-img" loading="lazy"/>` +
          `<div class="yt-play">▶</div>` +
          `</div>` +
          `<span class="yt-title">${text}</span>` +
          `</a>`
      }
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`
    },
  },
})

export { marked }
