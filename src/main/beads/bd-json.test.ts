import { describe, expect, it } from 'vitest'
import { parseBdJson, parseBdJsonList, parseBdJsonRecord, unwrapBdJsonEnvelope } from './bd-json'

describe('bd JSON parsing', () => {
  it('unwraps the BD_JSON_ENVELOPE format but not plain objects with schema_version', () => {
    expect(unwrapBdJsonEnvelope({ schema_version: 1, data: [1] })).toEqual([1])
    expect(unwrapBdJsonEnvelope({ schema_version: 1, count: 2 })).toEqual({
      schema_version: 1,
      count: 2
    })
  })

  it('parses lists, treating empty stdout and null as empty', () => {
    expect(parseBdJsonList('[{"id":"a"}]')).toEqual([{ id: 'a' }])
    expect(parseBdJsonList('{"schema_version":1,"data":[]}')).toEqual([])
    expect(parseBdJsonList('')).toEqual([])
    expect(parseBdJsonList('null')).toEqual([])
  })

  it('throws on unparseable output, error payloads and wrong top-level types', () => {
    expect(() => parseBdJson('not json')).toThrow(/unparseable JSON/)
    expect(() => parseBdJson('{"error":"boom"}')).toThrow(/bd reported an error: boom/)
    expect(() => parseBdJson('{"schema_version":1,"data":{"error":"boom"}}')).toThrow(/boom/)
    expect(() => parseBdJsonList('{"count":1}')).toThrow(/non-list/)
    expect(() => parseBdJsonRecord('[]')).toThrow(/non-object/)
  })

  it('parses records', () => {
    expect(parseBdJsonRecord('{"count":24,"schema_version":1}')).toEqual({
      count: 24,
      schema_version: 1
    })
  })
})
