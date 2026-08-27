const properCase = (word: string): string =>
  word.length >= 1 ? word[0]!.toUpperCase() + word.toLowerCase().slice(1) : word

const isBlank = (str?: string | null): boolean => !str || /^\s*$/.test(str)

/**
 * Converts a name (first name, last name, middle name, etc.) to proper case equivalent, handling double-barreled names
 * correctly (i.e. each part in a double-barreled is converted to proper case).
 * @param name name to be converted.
 * @returns name converted to proper case.
 */
const properCaseName = (name: string): string => (isBlank(name) ? '' : name.split('-').map(properCase).join('-'))

export const convertToTitleCase = (sentence?: string | null): string =>
  isBlank(sentence) ? '' : sentence!.split(' ').map(properCaseName).join(' ')

export const formatDate = (value?: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * A short date with no leading zeros, per the MOJ style guide - `3/1/2026`, not `03/01/2026`.
 * Built from the date parts rather than `toLocaleDateString`, because the en-GB locale pads day and
 * month to two digits whatever the `day`/`month` options say.
 */
export const formatShortDate = (value?: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export const formatDateTime = (value?: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatNumber = (value?: number | string | null): string => {
  if (value === null || value === undefined || value === '') return ''
  const number = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(number)) return ''
  return number.toLocaleString('en-GB')
}

export const initialiseName = (fullName?: string | null): string | null => {
  // this check is for the authError page
  if (!fullName) return null

  const array = fullName.split(' ')
  return `${array[0]?.[0]}. ${array.reverse()[0]}`
}
