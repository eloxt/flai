import { describe, expect, it } from 'vitest'
import { isTextFile, uploadMediaType } from '../src/lib/file-types'

describe('uploadMediaType', () => {
  it('stores text files browsers misreport as text/plain', () => {
    expect(uploadMediaType({ name: 'app.ts', type: 'video/mp2t' })).toBe('text/plain')
    expect(uploadMediaType({ name: 'server.LOG', type: '' })).toBe('text/plain')
    expect(uploadMediaType({ name: 'settings.ini', type: 'application/octet-stream' })).toBe('text/plain')
  })

  it('keeps accurate types', () => {
    expect(uploadMediaType({ name: 'notes.md', type: 'text/markdown' })).toBe('text/markdown')
    expect(uploadMediaType({ name: 'data.json', type: 'application/json' })).toBe('application/json')
    expect(uploadMediaType({ name: 'photo.png', type: 'image/png' })).toBe('image/png')
    expect(uploadMediaType({ name: 'blob', type: '' })).toBe('application/octet-stream')
  })
})

describe('isTextFile', () => {
  it('recognises text by media type or, for files stored with a wrong type, by extension', () => {
    expect(isTextFile('text/csv')).toBe(true)
    expect(isTextFile('application/x-yaml')).toBe(true)
    expect(isTextFile('video/mp2t', 'index.ts')).toBe(true)
    expect(isTextFile('application/pdf', 'paper.pdf')).toBe(false)
    expect(isTextFile('image/png')).toBe(false)
  })
})
