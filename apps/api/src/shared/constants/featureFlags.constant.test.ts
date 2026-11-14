import { describe, expect, it } from 'bun:test'

import { isAudioOrdersEnabled } from './featureFlags.constant'

describe('isAudioOrdersEnabled', () => {
  it('fica desligado sem a variável', () => {
    expect(isAudioOrdersEnabled({})).toBe(false)
  })

  it('só liga com "true" (aceita maiúscula e espaço)', () => {
    expect(isAudioOrdersEnabled({ FEATURE_AUDIO_ORDERS: 'true' })).toBe(true)
    expect(isAudioOrdersEnabled({ FEATURE_AUDIO_ORDERS: ' TRUE ' })).toBe(true)
    expect(isAudioOrdersEnabled({ FEATURE_AUDIO_ORDERS: '1' })).toBe(false)
    expect(isAudioOrdersEnabled({ FEATURE_AUDIO_ORDERS: 'false' })).toBe(false)
  })
})
