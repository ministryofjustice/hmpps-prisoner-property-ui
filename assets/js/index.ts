import * as govukFrontend from 'govuk-frontend'
import * as mojFrontend from '@ministryofjustice/frontend'

govukFrontend.initAll()
mojFrontend.initAll()

// On the change-container details page, excess property is held off-site at Branston and never picks a
// storage location, so hide the storage-location choice when the Excess property type is selected. The
// server enforces this regardless; this is just progressive enhancement of the form.
function initExcessLocationToggle(): void {
  const group = document.getElementById('location-choice-group')
  if (!group) return
  const typeRadios = document.querySelectorAll<HTMLInputElement>('input[name="containerType"]')
  if (!typeRadios.length) return

  const update = (): void => {
    const selected = document.querySelector<HTMLInputElement>('input[name="containerType"]:checked')
    group.hidden = selected?.value === 'EXCESS'
  }

  typeRadios.forEach(radio => radio.addEventListener('change', update))
  update()
}

initExcessLocationToggle()
