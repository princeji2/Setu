'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'identity_documents_portal_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const CITIZEN_DATA = [
  // 0. Existing demo citizen Aarav Sharma
  {
    holderName: 'Aarav Sharma',
    dob: '1988-04-12',
    regRef: 'REG-A3F7C291',
    licenceNumber: 'DL-01198800123',
    licenceIssueDate: '2016-05-10',
    licenceValidFrom: '2016-05-10',
    licenceExpiryDate: '2036-05-09',
    janAadhaarId: '1000000123',
    familyCount: 4,
    rcRef: 'RC-DL01AB0123',
    vehicleNumber: 'DL-01-AB-0123',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Hyundai Creta SX',
    regDate: '2021-06-15',
    fuelType: 'PETROL',
    passRef: 'PASS-K0000123',
    passportNumber: 'K2089123',
    placeOfIssue: 'Delhi',
  },
  // 0b. Standard demo reference aliases (matches catalog placeholders e.g. REG-000101, RC-000101, PASS-000101)
  {
    holderName: 'Aarav Sharma',
    dob: '1988-04-12',
    regRef: 'REG-000101',
    licenceNumber: 'DL-01198800101',
    licenceIssueDate: '2016-05-10',
    licenceValidFrom: '2016-05-10',
    licenceExpiryDate: '2036-05-09',
    janAadhaarId: '1000000101',
    familyCount: 4,
    rcRef: 'RC-000101',
    vehicleNumber: 'DL-01-AB-0101',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Hyundai Creta SX',
    regDate: '2021-06-15',
    fuelType: 'PETROL',
    passRef: 'PASS-000101',
    passportNumber: 'K2089101',
    placeOfIssue: 'Delhi',
  },
  // 1. Aditi Rao (Clean match)
  {
    holderName: 'Aditi Rao',
    dob: '1994-03-14',
    regRef: 'REG-7B010001',
    licenceNumber: 'DL-0420110001',
    licenceIssueDate: '2015-08-20',
    licenceValidFrom: '2015-08-20',
    licenceExpiryDate: '2035-08-19',
    janAadhaarId: '7700000001',
    familyCount: 3,
    rcRef: 'RC-7B010001',
    vehicleNumber: 'DL-03-CC-9481',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Tata Nexon EV',
    regDate: '2022-04-10',
    fuelType: 'ELECTRIC',
    passRef: 'PASS-7B010001',
    passportNumber: 'M4091823',
    placeOfIssue: 'Delhi',
  },
  // 2. Vikramaditya Sengupta (Clean match)
  {
    holderName: 'Vikramaditya Sengupta',
    dob: '1982-08-22',
    regRef: 'REG-7B010002',
    licenceNumber: 'WB-0220020002',
    licenceIssueDate: '2010-03-15',
    licenceValidFrom: '2010-03-15',
    licenceExpiryDate: '2030-03-14',
    janAadhaarId: '7700000002',
    familyCount: 4,
    rcRef: 'RC-7B010002',
    vehicleNumber: 'WB-02-AK-8221',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Honda City ZX',
    regDate: '2019-11-04',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010002',
    passportNumber: 'N8192031',
    placeOfIssue: 'Kolkata',
  },
  // 3. Meera Nambiar (Clean match)
  {
    holderName: 'Meera Nambiar',
    dob: '1990-11-05',
    regRef: 'REG-7B010003',
    licenceNumber: 'KL-0720120003',
    licenceIssueDate: '2013-09-12',
    licenceValidFrom: '2013-09-12',
    licenceExpiryDate: '2033-09-11',
    janAadhaarId: '7700000003',
    familyCount: 2,
    rcRef: 'RC-7B010003',
    vehicleNumber: 'KL-07-CD-9055',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Maruti Suzuki Swift',
    regDate: '2020-02-18',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010003',
    passportNumber: 'P2918472',
    placeOfIssue: 'Cochin',
  },
  // 4. Arjun Kulkarni (Clean match)
  {
    holderName: 'Arjun Kulkarni',
    dob: '1987-05-19',
    regRef: 'REG-7B010004',
    licenceNumber: 'MH-1220090004',
    licenceIssueDate: '2011-07-25',
    licenceValidFrom: '2011-07-25',
    licenceExpiryDate: '2031-07-24',
    janAadhaarId: '7700000004',
    familyCount: 5,
    rcRef: 'RC-7B010004',
    vehicleNumber: 'MH-12-RP-8719',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Mahindra XUV700',
    regDate: '2023-01-15',
    fuelType: 'DIESEL',
    passRef: 'PASS-7B010004',
    passportNumber: 'R5829104',
    placeOfIssue: 'Pune',
  },
  // 5. Sneha Deshmukh (Clean match)
  {
    holderName: 'Sneha Deshmukh',
    dob: '1996-01-28',
    regRef: 'REG-7B010005',
    licenceNumber: 'MH-0120160005',
    licenceIssueDate: '2017-02-14',
    licenceValidFrom: '2017-02-14',
    licenceExpiryDate: '2037-02-13',
    janAadhaarId: '7700000005',
    familyCount: 3,
    rcRef: 'RC-7B010005',
    vehicleNumber: 'MH-01-EE-9628',
    vehicleClass: 'Two Wheeler (MCWG)',
    makerModel: 'Ather 450X',
    regDate: '2022-08-19',
    fuelType: 'ELECTRIC',
    passRef: 'PASS-7B010005',
    passportNumber: 'S7192841',
    placeOfIssue: 'Mumbai',
  },
  // 6. Harshvardhan Reddy (Clean match)
  {
    holderName: 'Harshvardhan Reddy',
    dob: '1979-09-12',
    regRef: 'REG-7B010006',
    licenceNumber: 'TS-0920050006',
    licenceIssueDate: '2008-04-11',
    licenceValidFrom: '2008-04-11',
    licenceExpiryDate: '2028-04-10',
    janAadhaarId: '7700000006',
    familyCount: 4,
    rcRef: 'RC-7B010006',
    vehicleNumber: 'TS-09-FA-7912',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Toyota Fortuner',
    regDate: '2021-03-29',
    fuelType: 'DIESEL',
    passRef: 'PASS-7B010006',
    passportNumber: 'T9281745',
    placeOfIssue: 'Hyderabad',
  },
  // 7. Kiran Mazumdar (Clean match)
  {
    holderName: 'Kiran Mazumdar',
    dob: '1985-04-03',
    regRef: 'REG-7B010007',
    licenceNumber: 'KA-0420080007',
    licenceIssueDate: '2009-10-05',
    licenceValidFrom: '2009-10-05',
    licenceExpiryDate: '2029-10-04',
    janAadhaarId: '7700000007',
    familyCount: 2,
    rcRef: 'RC-7B010007',
    vehicleNumber: 'KA-04-MB-8503',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Kia Seltos GTX',
    regDate: '2020-07-14',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010007',
    passportNumber: 'U1829304',
    placeOfIssue: 'Bengaluru',
  },
  // 8. Devendra Joshi (Clean match)
  {
    holderName: 'Devendra Joshi',
    dob: '1991-12-17',
    regRef: 'REG-7B010008',
    licenceNumber: 'RJ-1420130008',
    licenceIssueDate: '2014-06-18',
    licenceValidFrom: '2014-06-18',
    licenceExpiryDate: '2034-06-17',
    janAadhaarId: '7700000008',
    familyCount: 4,
    rcRef: 'RC-7B010008',
    vehicleNumber: 'RJ-14-DJ-9117',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Skoda Kushaq',
    regDate: '2022-12-01',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010008',
    passportNumber: 'V3918274',
    placeOfIssue: 'Jaipur',
  },
  // 9. Sunita Sundaram (Clean match)
  {
    holderName: 'Sunita Sundaram',
    dob: '1975-07-30',
    regRef: 'REG-7B010009',
    licenceNumber: 'TN-0120010009',
    licenceIssueDate: '2004-01-22',
    licenceValidFrom: '2004-01-22',
    licenceExpiryDate: '2024-01-21',
    janAadhaarId: '7700000009',
    familyCount: 3,
    rcRef: 'RC-7B010009',
    vehicleNumber: 'TN-01-SS-7530',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Honda Jazz',
    regDate: '2018-09-11',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010009',
    passportNumber: 'W4829103',
    placeOfIssue: 'Chennai',
  },
  // 10. Manish Tiwari (Clean match)
  {
    holderName: 'Manish Tiwari',
    dob: '1988-02-25',
    regRef: 'REG-7B010010',
    licenceNumber: 'UP-3220100010',
    licenceIssueDate: '2012-11-08',
    licenceValidFrom: '2012-11-08',
    licenceExpiryDate: '2032-11-07',
    janAadhaarId: '7700000010',
    familyCount: 5,
    rcRef: 'RC-7B010010',
    vehicleNumber: 'UP-32-MT-8825',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Hyundai Verna SX',
    regDate: '2023-04-05',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010010',
    passportNumber: 'X8291024',
    placeOfIssue: 'Lucknow',
  },
  // 11. Deepika Padukone-Bose (Clean match)
  {
    holderName: 'Deepika Padukone-Bose',
    dob: '1993-10-09',
    regRef: 'REG-7B010011',
    licenceNumber: 'KA-0320140011',
    licenceIssueDate: '2015-05-14',
    licenceValidFrom: '2015-05-14',
    licenceExpiryDate: '2035-05-13',
    janAadhaarId: '7700000011',
    familyCount: 2,
    rcRef: 'RC-7B010011',
    vehicleNumber: 'KA-03-DP-9310',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'BMW 330i',
    regDate: '2021-08-20',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010011',
    passportNumber: 'Y9182734',
    placeOfIssue: 'Bengaluru',
  },
  // 12. Gaurav Bhatia (Clean match)
  {
    holderName: 'Gaurav Bhatia',
    dob: '1986-06-14',
    regRef: 'REG-7B010012',
    licenceNumber: 'CH-0120090012',
    licenceIssueDate: '2010-12-19',
    licenceValidFrom: '2010-12-19',
    licenceExpiryDate: '2030-12-18',
    janAadhaarId: '7700000012',
    familyCount: 4,
    rcRef: 'RC-7B010012',
    vehicleNumber: 'CH-01-GB-8614',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Volkswagen Taigun',
    regDate: '2022-05-11',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010012',
    passportNumber: 'Z1928374',
    placeOfIssue: 'Chandigarh',
  },
  // 13. Ananya Ghosh (Clean match)
  {
    holderName: 'Ananya Ghosh',
    dob: '1997-08-31',
    regRef: 'REG-7B010013',
    licenceNumber: 'WB-0120180013',
    licenceIssueDate: '2019-03-01',
    licenceValidFrom: '2019-03-01',
    licenceExpiryDate: '2039-02-28',
    janAadhaarId: '7700000013',
    familyCount: 3,
    rcRef: 'RC-7B010013',
    vehicleNumber: 'WB-01-AG-9731',
    vehicleClass: 'Two Wheeler (MCWG)',
    makerModel: 'TVS iQube Electric',
    regDate: '2023-02-14',
    fuelType: 'ELECTRIC',
    passRef: 'PASS-7B010013',
    passportNumber: 'A2839182',
    placeOfIssue: 'Kolkata',
  },
  // 14. Naveen Patnaik (Clean match)
  {
    holderName: 'Naveen Patnaik',
    dob: '1980-04-18',
    regRef: 'REG-7B010014',
    licenceNumber: 'OD-0220060014',
    licenceIssueDate: '2007-09-28',
    licenceValidFrom: '2007-09-28',
    licenceExpiryDate: '2027-09-27',
    janAadhaarId: '7700000014',
    familyCount: 3,
    rcRef: 'RC-7B010014',
    vehicleNumber: 'OD-02-NP-8018',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Toyota Innova Crysta',
    regDate: '2019-05-22',
    fuelType: 'DIESEL',
    passRef: 'PASS-7B010014',
    passportNumber: 'B3948192',
    placeOfIssue: 'Bhubaneswar',
  },
  // 15. Patel Kavita Suresh (Transposed Name in DLJA vs Kavita Suresh Patel in NIR)
  {
    holderName: 'Patel Kavita Suresh',
    dob: '1989-09-15',
    regRef: 'REG-7B010015',
    licenceNumber: 'GJ-0120120015',
    licenceIssueDate: '2013-04-17',
    licenceValidFrom: '2013-04-17',
    licenceExpiryDate: '2033-04-16',
    janAadhaarId: '7700000015',
    familyCount: 4,
    rcRef: 'RC-7B010015',
    vehicleNumber: 'GJ-01-KP-8915',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Maruti Baleno Alpha',
    regDate: '2020-10-18',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010015',
    passportNumber: 'C4928172',
    placeOfIssue: 'Ahmedabad',
  },
  // 16. Rajesh Kumar Mukherjee (Full Name in DLJA/NIR vs R. K. Mukherjee in DTR)
  {
    holderName: 'Rajesh Kumar Mukherjee',
    dob: '1983-03-21',
    regRef: 'REG-7B010016',
    licenceNumber: 'WB-0620070016',
    licenceIssueDate: '2008-08-09',
    licenceValidFrom: '2008-08-09',
    licenceExpiryDate: '2028-08-08',
    janAadhaarId: '7700000016',
    familyCount: 4,
    rcRef: 'RC-7B010016',
    vehicleNumber: 'WB-06-RM-8321',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Hyundai i20 Asta',
    regDate: '2021-04-12',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010016',
    passportNumber: 'D5928193',
    placeOfIssue: 'Kolkata',
  },
  // 17. Amitabh Saxena (DOB 1-day difference: DLJA has 1984-06-16 vs NIR 1984-06-15)
  {
    holderName: 'Amitabh Saxena',
    dob: '1984-06-16',
    regRef: 'REG-7B010017',
    licenceNumber: 'DL-0920080017',
    licenceIssueDate: '2009-11-20',
    licenceValidFrom: '2009-11-20',
    licenceExpiryDate: '2029-11-19',
    janAadhaarId: '7700000017',
    familyCount: 3,
    rcRef: 'RC-7B010017',
    vehicleNumber: 'DL-09-AS-8416',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Tata Safari XZ+',
    regDate: '2022-09-30',
    fuelType: 'DIESEL',
    passRef: 'PASS-7B010017',
    passportNumber: 'E6928104',
    placeOfIssue: 'Delhi',
  },
  // 18. Siddharth Malhotra (DOB 1-year mismatch vs DTR: DLJA has 1990-12-05 matching NIR)
  {
    holderName: 'Siddharth Malhotra',
    dob: '1990-12-05',
    regRef: 'REG-7B010018',
    licenceNumber: 'DL-0720130018',
    licenceIssueDate: '2014-02-15',
    licenceValidFrom: '2014-02-15',
    licenceExpiryDate: '2034-02-14',
    janAadhaarId: '7700000018',
    familyCount: 2,
    rcRef: 'RC-7B010018',
    vehicleNumber: 'DL-07-SM-9012',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Mercedes-Benz C200',
    regDate: '2023-05-19',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010018',
    passportNumber: 'F7928105',
    placeOfIssue: 'Delhi',
  },
  // 19. Vikram Choudhary (Name spelling discrepancy: Choudhary in DLJA vs Choudhury in NIR)
  {
    holderName: 'Vikram Choudhary',
    dob: '1985-07-11',
    regRef: 'REG-7B010019',
    licenceNumber: 'KA-0520090019',
    licenceIssueDate: '2010-08-25',
    licenceValidFrom: '2010-08-25',
    licenceExpiryDate: '2030-08-24',
    janAadhaarId: '7700000019',
    familyCount: 4,
    rcRef: 'RC-7B010019',
    vehicleNumber: 'KA-05-VC-8511',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Jeep Compass Limited',
    regDate: '2020-03-17',
    fuelType: 'DIESEL',
    passRef: 'PASS-7B010019',
    passportNumber: 'G8928106',
    placeOfIssue: 'Bengaluru',
  },
  // 20. Pooja Verma (Name discrepancy: Pooja Verma in DLJA vs Pooja Sharma in NIR)
  {
    holderName: 'Pooja Verma',
    dob: '1992-04-02',
    regRef: 'REG-7B010020',
    licenceNumber: 'DL-0220150020',
    licenceIssueDate: '2016-10-12',
    licenceValidFrom: '2016-10-12',
    licenceExpiryDate: '2036-10-11',
    janAadhaarId: '7700000020',
    familyCount: 3,
    rcRef: 'RC-7B010020',
    vehicleNumber: 'DL-02-PV-9204',
    vehicleClass: 'Motor Car (LMV)',
    makerModel: 'Maruti Dzire ZXi',
    regDate: '2021-11-25',
    fuelType: 'PETROL',
    passRef: 'PASS-7B010020',
    passportNumber: 'H9928107',
    placeOfIssue: 'Delhi',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('[DLJA SEED] Creating vehicle_rcs and passports tables if not present...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_rcs (
        id SERIAL PRIMARY KEY,
        registration_reference VARCHAR(20) NOT NULL UNIQUE,
        owner_name VARCHAR(255) NOT NULL,
        vehicle_number VARCHAR(20) NOT NULL,
        vehicle_class VARCHAR(50) NOT NULL,
        maker_model VARCHAR(100) NOT NULL,
        registration_date DATE NOT NULL,
        fuel_type VARCHAR(20) NOT NULL,
        verification_status VARCHAR(50) NOT NULL DEFAULT 'FORMAT_VALID',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS passports (
        id SERIAL PRIMARY KEY,
        registration_reference VARCHAR(20) NOT NULL UNIQUE,
        holder_name VARCHAR(255) NOT NULL,
        passport_number VARCHAR(20) NOT NULL,
        dob DATE NOT NULL,
        nationality VARCHAR(50) NOT NULL DEFAULT 'INDIAN',
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        place_of_issue VARCHAR(100) NOT NULL,
        verification_status VARCHAR(50) NOT NULL DEFAULT 'FORMAT_VALID',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('[DLJA SEED] Seeding demo records...');

    for (const c of CITIZEN_DATA) {
      // 1. Driving Licence in registrations
      if (c.regRef) {
        await client.query(`
          INSERT INTO registrations
            (registration_reference, licence_number, licence_holder_name,
             licence_issue_date, licence_valid_from, licence_expiry_date,
             jan_aadhaar_id, family_members_count, verification_status, verification_provider,
             submitted_ip)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FORMAT_VALID', 'MockVerificationProvider', '127.0.0.1')
          ON CONFLICT (registration_reference) DO UPDATE
            SET licence_holder_name = EXCLUDED.licence_holder_name,
                licence_issue_date  = EXCLUDED.licence_issue_date,
                licence_valid_from  = EXCLUDED.licence_valid_from,
                licence_expiry_date = EXCLUDED.licence_expiry_date;
        `, [
          c.regRef,
          c.licenceNumber,
          c.holderName,
          c.licenceIssueDate,
          c.licenceValidFrom,
          c.licenceExpiryDate,
          c.janAadhaarId,
          c.familyCount,
        ]);
        console.log(`  ✓ DL: ${c.regRef} (${c.holderName})`);
      }

      // 2. Vehicle RC in vehicle_rcs
      if (c.rcRef) {
        await client.query(`
          INSERT INTO vehicle_rcs
            (registration_reference, owner_name, vehicle_number, vehicle_class,
             maker_model, registration_date, fuel_type, verification_status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'FORMAT_VALID')
          ON CONFLICT (registration_reference) DO UPDATE
            SET owner_name       = EXCLUDED.owner_name,
                vehicle_number   = EXCLUDED.vehicle_number,
                vehicle_class    = EXCLUDED.vehicle_class,
                maker_model      = EXCLUDED.maker_model,
                registration_date= EXCLUDED.registration_date,
                fuel_type        = EXCLUDED.fuel_type;
        `, [
          c.rcRef,
          c.holderName,
          c.vehicleNumber,
          c.vehicleClass,
          c.makerModel,
          c.regDate,
          c.fuelType,
        ]);
        console.log(`  ✓ RC: ${c.rcRef} (${c.holderName})`);
      }

      // 3. Passport in passports
      if (c.passRef) {
        await client.query(`
          INSERT INTO passports
            (registration_reference, holder_name, passport_number, dob,
             nationality, issue_date, expiry_date, place_of_issue, verification_status)
          VALUES ($1, $2, $3, $4, 'INDIAN', '2018-05-20', '2028-05-19', $5, 'FORMAT_VALID')
          ON CONFLICT (registration_reference) DO UPDATE
            SET holder_name   = EXCLUDED.holder_name,
                passport_number=EXCLUDED.passport_number,
                dob           = EXCLUDED.dob,
                place_of_issue= EXCLUDED.place_of_issue;
        `, [
          c.passRef,
          c.holderName,
          c.passportNumber,
          c.dob,
          c.placeOfIssue,
        ]);
        console.log(`  ✓ Passport: ${c.passRef} (${c.holderName})`);
      }
    }

    console.log('[DLJA SEED] All synthetic documents seeded successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('[DLJA SEED ERROR]:', err.message);
    process.exit(1);
  });
}

module.exports = { seed, CITIZEN_DATA };
