// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteWorktreeDialogFooter } from './DeleteWorktreeDialogFooter'

afterEach(cleanup)

function renderFooter(disableConfirm?: boolean): void {
  render(
    <DeleteWorktreeDialogFooter
      isMainWorktree={false}
      isDeleting={false}
      canForceDelete={false}
      isBatchDelete={false}
      worktreeCount={1}
      canDeleteAllLineage={false}
      lineageDeleteTargetCount={0}
      disableConfirm={disableConfirm}
      onCancel={vi.fn()}
      onForceDelete={vi.fn()}
      onDelete={vi.fn()}
      confirmButtonRef={{ current: null }}
    />
  )
}

describe('DeleteWorktreeDialogFooter', () => {
  it('leaves the confirm button enabled by default', () => {
    renderFooter()
    expect(screen.getByRole('button', { name: 'Delete Workspace' })).toBeEnabled()
  })

  // Regression for the beads disposition's empty-reason guard: without this the
  // hook's canSubmit refusal is real only in memory and the button silently no-ops.
  it('disables the confirm button when disableConfirm is true', () => {
    renderFooter(true)
    expect(screen.getByRole('button', { name: 'Delete Workspace' })).toBeDisabled()
  })
})
