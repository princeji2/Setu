'use strict';

/**
 * Identity Matcher — Cross-Registry Identity Matching & Consistency Engine.
 *
 * Compares demographic fields (full name, date of birth) returned by two
 * different departments for the same citizen to detect discrepancies.
 *
 * Algorithms:
 *  - Levenshtein distance for character-level edit distance
 *  - Token-sort similarity for out-of-order words (e.g. "Kumar Rajesh" vs "Rajesh Kumar")
 *  - Date of Birth exact / year-level consistency comparison
 *  - Weighted composite confidence score (0 - 100%)
 */

/**
 * Calculate Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[m][n];
}

/**
 * Normalise a name string: lowercase, remove punctuation, collapse whitespace.
 * @param {string} str
 * @returns {string}
 */
function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-sort string: sorts word tokens alphabetically.
 * E.g. "Rajesh Kumar" -> "kumar rajesh"
 * @param {string} str
 * @returns {string}
 */
function tokenSort(str) {
  const norm = normalizeName(str);
  if (!norm) return '';
  return norm.split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Compute token-sort ratio between two names (0.0 to 1.0).
 * Handles word order variations and calculates edit distance on sorted tokens.
 * @param {string} nameA
 * @param {string} nameB
 * @returns {number}
 */
function tokenSortRatio(nameA, nameB) {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);

  if (!normA && !normB) return 1.0;
  if (!normA || !normB) return 0.0;
  if (normA === normB) return 1.0;

  const sortedA = tokenSort(nameA);
  const sortedB = tokenSort(nameB);

  if (sortedA === sortedB) return 1.0;

  const dist = levenshtein(sortedA, sortedB);
  const maxLen = Math.max(sortedA.length, sortedB.length);
  if (maxLen === 0) return 1.0;

  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Normalise a date string to YYYY-MM-DD if possible.
 * @param {string|Date} dateVal
 * @returns {string|null}
 */
function normalizeDob(dateVal) {
  if (!dateVal) return null;
  const s = String(dateVal).trim();
  // Match standard YYYY-MM-DD or YYYY/MM/DD
  const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m1) {
    const y = m1[1];
    const m = m1[2].padStart(2, '0');
    const d = m1[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Match DD-MM-YYYY or DD/MM/YYYY
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m2) {
    const d = m2[1].padStart(2, '0');
    const m = m2[2].padStart(2, '0');
    const y = m2[3];
    return `${y}-${m}-${d}`;
  }
  // Match year only e.g. 1980
  const m3 = s.match(/^(\d{4})/);
  if (m3) return m3[1];

  return s;
}

/**
 * Compare two DOB values (0.0 to 1.0).
 * Returns null if either value is missing.
 * @param {string} dobA
 * @param {string} dobB
 * @returns {number|null}
 */
function compareDob(dobA, dobB) {
  const normA = normalizeDob(dobA);
  const normB = normalizeDob(dobB);

  if (!normA || !normB) return null;
  if (normA === normB) return 1.0;

  // If both have 4-digit years that match:
  const yearA = normA.slice(0, 4);
  const yearB = normB.slice(0, 4);
  if (yearA.length === 4 && yearB.length === 4 && yearA === yearB) {
    return 0.6; // Same year, but month/day discrepancy
  }

  return 0.0;
}

/**
 * Compare demographic objects from two departments for the same citizen.
 *
 * @param {object} current - { fullName, dob, department }
 * @param {object} previous - { fullName, dob, department }
 * @returns {{
 *   confidence: number,
 *   hasDiscrepancy: boolean,
 *   nameScore: number,
 *   dobScore: number|null,
 *   discrepancy: object|null
 * }}
 */
function compareDemographics(current = {}, previous = {}) {
  const currentName = current.fullName || current.full_name || current.licence_holder_name || '';
  const prevName = previous.fullName || previous.full_name || previous.licence_holder_name || '';

  const nameRatio = tokenSortRatio(currentName, prevName);
  const nameScore = Math.round(nameRatio * 100);

  const currentDob = current.dob || current.dateOfBirth || current.date_of_birth || null;
  const prevDob = previous.dob || previous.dateOfBirth || previous.date_of_birth || null;

  const dobRatio = compareDob(currentDob, prevDob);
  const dobScore = dobRatio !== null ? Math.round(dobRatio * 100) : null;

  let confidence = nameScore;
  if (dobScore !== null) {
    // 70% weight on full name, 30% on DOB
    confidence = Math.round(nameScore * 0.7 + dobScore * 0.3);
  }

  const hasDiscrepancy = confidence < 70;

  let discrepancy = null;
  if (hasDiscrepancy) {
    discrepancy = {
      conflicting_department: previous.department || 'previously_verified',
      field: dobScore !== null && dobScore < 70 && nameScore >= 70 ? 'dob' : 'fullName',
      current_value: currentName,
      previous_value: prevName,
      current_dob: currentDob,
      previous_dob: prevDob,
      confidence,
    };
  }

  return {
    confidence,
    hasDiscrepancy,
    nameScore,
    dobScore,
    discrepancy,
  };
}

module.exports = {
  levenshtein,
  normalizeName,
  tokenSort,
  tokenSortRatio,
  normalizeDob,
  compareDob,
  compareDemographics,
};
