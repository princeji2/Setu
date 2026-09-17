const { query } = require('../config/database');

class RegistrationService {
  /**
   * Generates a deterministic, compliant set of synthetic demographic fields for an identity reference.
   * @param {string} identityReference
   * @returns {Array<{ name: string, value: string, verified: boolean, lastUpdated: string }>}
   */
  static generateSyntheticFields(identityReference) {
    const now = new Date().toISOString();
    const hash = Array.from(identityReference).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const names = [
      'Test Citizen One',
      'Aarav Sharma',
      'Priya Patel',
      'Vikram Singh',
      'Sunita Rao',
      'Ananya Verma',
      'Rohan Gupta',
    ];
    const name = names[hash % names.length];
    const year = 1975 + (hash % 30);
    const month = String(1 + (hash % 12)).padStart(2, '0');
    const day = String(1 + (hash % 28)).padStart(2, '0');
    const dob = `${year}-${month}-${day}`;
    const gender = hash % 2 === 0 ? 'Male' : 'Female';
    const address = `Synthetic Address #${100 + (hash % 900)}, Test Block, Demo District, New Delhi - 110001`;

    return [
      { name: 'fullName', value: name, verified: true, lastUpdated: now },
      { name: 'dob', value: dob, verified: true, lastUpdated: now },
      { name: 'gender', value: gender, verified: true, lastUpdated: now },
      { name: 'address', value: address, verified: true, lastUpdated: now },
    ];
  }

  /**
   * Look up a registration record by synthetic identity reference
   * @param {string} identityReference
   */
  static async findByIdentityReference(identityReference) {
    const sql = `
      SELECT id, identity_reference, status, fields,
             name, mobile_number, address, father_name,
             created_at, updated_at
      FROM registrations
      WHERE identity_reference = $1;
    `;
    const res = await query(sql, [identityReference]);
    return res.rows[0] || null;
  }

  /**
   * Look up fields for an identity reference.
   * Returns null if not registered.
   * @param {string} identityReference
   */
  static async getFieldsByIdentityReference(identityReference) {
    const record = await this.findByIdentityReference(identityReference);
    if (!record) {
      return null;
    }

    let fields = record.fields;
    if (!fields || (Array.isArray(fields) && fields.length === 0)) {
      fields = this.generateSyntheticFields(identityReference);
      // Persist generated fields for future lookups
      await query(
        'UPDATE registrations SET fields = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(fields), record.id]
      ).catch(() => {});
    } else if (typeof fields === 'string') {
      try {
        fields = JSON.parse(fields);
      } catch (e) {
        fields = this.generateSyntheticFields(identityReference);
      }
    }

    return {
      ...record,
      fields,
    };
  }

  /**
   * Registers a new synthetic identity reference with personal information.
   * If already registered, returns existing record.
   * Leverages PostgreSQL ON CONFLICT / UNIQUE constraint to guarantee duplicate prevention.
   *
   * @param {string} identityReference
   * @param {{ name: string, mobileNumber: string, address: string, fatherName: string }} personalInfo
   * @returns {{ registered: boolean, record: Object, isNew: boolean }}
   */
  static async checkAndRegister(identityReference, personalInfo = {}) {
    // 1. First check if it already exists
    const existing = await this.findByIdentityReference(identityReference);
    if (existing) {
      return {
        registered: true,
        record: existing,
        isNew: false,
      };
    }

    // 2. Insert new record with personal information and default synthetic demographic fields
    const defaultFields = this.generateSyntheticFields(identityReference);
    const { name = null, mobileNumber = null, address = null, fatherName = null } = personalInfo;

    try {
      const insertSql = `
        INSERT INTO registrations
          (identity_reference, status, fields, name, mobile_number, address, father_name, created_at, updated_at)
        VALUES
          ($1, 'REGISTERED', $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, identity_reference, status, fields, name, mobile_number, address, father_name, created_at, updated_at;
      `;
      const res = await query(insertSql, [
        identityReference,
        JSON.stringify(defaultFields),
        name,
        mobileNumber,
        address,
        fatherName,
      ]);
      return {
        registered: false,
        record: res.rows[0],
        isNew: true,
      };
    } catch (err) {
      // Catch potential concurrent insertion race condition (PostgreSQL code 23505 = unique_violation)
      if (err.code === '23505') {
        const raceExisting = await this.findByIdentityReference(identityReference);
        return {
          registered: true,
          record: raceExisting,
          isNew: false,
        };
      }
      throw err;
    }
  }

  /**
   * Retrieves dashboard statistics
   */
  static async getStats() {
    const totalSql = `SELECT COUNT(*)::int as total FROM registrations;`;
    const todaySql = `
      SELECT COUNT(*)::int as today 
      FROM registrations 
      WHERE created_at >= CURRENT_DATE;
    `;

    const [totalRes, todayRes] = await Promise.all([
      query(totalSql, []),
      query(todaySql, []),
    ]);

    return {
      totalRegistrations: totalRes.rows[0].total,
      registrationsToday: todayRes.rows[0].today,
    };
  }

  /**
   * Search registrations with pagination
   */
  static async searchRegistrations({ searchTerm = '', limit = 20, offset = 0 }) {
    let sql;
    let params;

    if (searchTerm) {
      sql = `
        SELECT id, identity_reference, status, name, mobile_number, created_at
        FROM registrations
        WHERE identity_reference ILIKE $1 OR name ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
      `;
      params = [`%${searchTerm}%`, limit, offset];
    } else {
      sql = `
        SELECT id, identity_reference, status, name, mobile_number, created_at
        FROM registrations
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2;
      `;
      params = [limit, offset];
    }

    const res = await query(sql, params);
    return res.rows;
  }
}

module.exports = RegistrationService;
