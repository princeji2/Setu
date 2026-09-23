const { pool, testConnection } = require('../backend/config/database');

const CITIZEN_PROFILES = [
  // 0. Existing demo citizen
  {
    name: 'Aarav Sharma',
    dob: '1988-04-12',
    gender: 'Male',
    idRef: 'TESTAADHAAR0001',
    voterRef: 'VOTER-DL-000123',
    birthRef: 'BIRTH-DEL-000123',
    epic: 'DL-01-88123',
    constituency: 'New Delhi (AC-40)',
    state: 'Delhi',
    polling: 'PS 4, Barakhamba Road',
    address: 'B-12, Civic Center Layout, Test District, New Delhi - 110001',
    pob: 'Safdarjung Hospital, New Delhi',
    father: 'Suresh Sharma',
    mother: 'Kamla Sharma',
    regNum: 'NDMC/B/1988/01123',
  },
  // 1. Aditi Rao (Clean match)
  {
    name: 'Aditi Rao',
    dob: '1994-03-14',
    gender: 'Female',
    idRef: 'TESTAADHAAR0010',
    voterRef: 'VOTER-DL-2001',
    birthRef: 'BIRTH-DEL-2001',
    epic: 'DL-2001-9481',
    constituency: 'New Delhi (AC-40)',
    state: 'Delhi',
    polling: 'PS 12, Govt Boys Senior Sec School',
    address: 'B-42, Defence Colony, New Delhi - 110024',
    pob: 'Safdarjung Hospital, New Delhi',
    father: 'Ramesh Rao',
    mother: 'Sunita Rao',
    regNum: 'NDMC/B/1994/08219',
  },
  // 2. Vikramaditya Sengupta (Clean match)
  {
    name: 'Vikramaditya Sengupta',
    dob: '1982-08-22',
    gender: 'Male',
    idRef: 'TESTAADHAAR0011',
    voterRef: 'VOTER-DL-2002',
    birthRef: 'BIRTH-DEL-2002',
    epic: 'WB-2002-8221',
    constituency: 'Bidhannagar (AC-116)',
    state: 'West Bengal',
    polling: 'PS 22, Salt Lake Community Hall',
    address: 'Block CF-182, Sector 1, Salt Lake, Kolkata - 700064',
    pob: 'Calcutta Medical College, Kolkata',
    father: 'Debashis Sengupta',
    mother: 'Aparna Sengupta',
    regNum: 'KMC/B/1982/10452',
  },
  // 3. Meera Nambiar (Clean match)
  {
    name: 'Meera Nambiar',
    dob: '1990-11-05',
    gender: 'Female',
    idRef: 'TESTAADHAAR0012',
    voterRef: 'VOTER-DL-2003',
    birthRef: 'BIRTH-DEL-2003',
    epic: 'KL-2003-9055',
    constituency: 'Ernakulam (AC-82)',
    state: 'Kerala',
    polling: 'PS 15, St. Teresa Convent',
    address: '4A, Skyline Riverview, Panampilly Nagar, Kochi - 682036',
    pob: 'General Hospital, Ernakulam',
    father: 'Gopinath Nambiar',
    mother: 'Radhika Nambiar',
    regNum: 'COK/B/1990/07321',
  },
  // 4. Arjun Kulkarni (Clean match)
  {
    name: 'Arjun Kulkarni',
    dob: '1987-05-19',
    gender: 'Male',
    idRef: 'TESTAADHAAR0013',
    voterRef: 'VOTER-DL-2004',
    birthRef: 'BIRTH-DEL-2004',
    epic: 'MH-2004-8719',
    constituency: 'Kothrud (AC-210)',
    state: 'Maharashtra',
    polling: 'PS 8, MIT Campus Hall',
    address: '14/B, Mayur Colony, Kothrud, Pune - 411038',
    pob: 'Sassoon Hospital, Pune',
    father: 'Madhav Kulkarni',
    mother: 'Shailaja Kulkarni',
    regNum: 'PMC/B/1987/11904',
  },
  // 5. Sneha Deshmukh (Clean match)
  {
    name: 'Sneha Deshmukh',
    dob: '1996-01-28',
    gender: 'Female',
    idRef: 'TESTAADHAAR0014',
    voterRef: 'VOTER-DL-2005',
    birthRef: 'BIRTH-DEL-2005',
    epic: 'MH-2005-9628',
    constituency: 'Mahim (AC-181)',
    state: 'Maharashtra',
    polling: 'PS 19, Balmohan Vidyamandir',
    address: 'Flat 702, Sea Breeze, Shivaji Park, Dadar West, Mumbai - 400028',
    pob: 'KEM Hospital, Parel, Mumbai',
    father: 'Anil Deshmukh',
    mother: 'Pratibha Deshmukh',
    regNum: 'MCGM/B/1996/04512',
  },
  // 6. Harshvardhan Reddy (Clean match)
  {
    name: 'Harshvardhan Reddy',
    dob: '1979-09-12',
    gender: 'Male',
    idRef: 'TESTAADHAAR0015',
    voterRef: 'VOTER-DL-2006',
    birthRef: 'BIRTH-DEL-2006',
    epic: 'TG-2006-7912',
    constituency: 'Jubilee Hills (AC-61)',
    state: 'Telangana',
    polling: 'PS 31, Jubilee Hills Club',
    address: 'Plot 48, Road No. 10, Jubilee Hills, Hyderabad - 500033',
    pob: 'Osmania General Hospital, Hyderabad',
    father: 'Pratap Reddy',
    mother: 'Vasundhara Reddy',
    regNum: 'GHMC/B/1979/01984',
  },
  // 7. Kiran Mazumdar (Clean match)
  {
    name: 'Kiran Mazumdar',
    dob: '1985-04-03',
    gender: 'Female',
    idRef: 'TESTAADHAAR0016',
    voterRef: 'VOTER-DL-2007',
    birthRef: 'BIRTH-DEL-2007',
    epic: 'KA-2007-8503',
    constituency: 'Malleshwaram (AC-157)',
    state: 'Karnataka',
    polling: 'PS 11, MES College Hall',
    address: '88, 15th Cross, Margosa Road, Malleshwaram, Bengaluru - 560003',
    pob: 'Victoria Hospital, Bengaluru',
    father: 'B. C. Mazumdar',
    mother: 'Yamini Mazumdar',
    regNum: 'BBMP/B/1985/08145',
  },
  // 8. Devendra Joshi (Clean match)
  {
    name: 'Devendra Joshi',
    dob: '1991-12-17',
    gender: 'Male',
    idRef: 'TESTAADHAAR0017',
    voterRef: 'VOTER-DL-2008',
    birthRef: 'BIRTH-DEL-2008',
    epic: 'RJ-2008-9117',
    constituency: 'Malviya Nagar (AC-51)',
    state: 'Rajasthan',
    polling: 'PS 25, Malviya Nagar Community Centre',
    address: 'E-44, Siddharth Nagar, Malviya Nagar, Jaipur - 302017',
    pob: 'SMS Hospital, Jaipur',
    father: 'Kailash Joshi',
    mother: 'Manju Joshi',
    regNum: 'JMC/B/1991/09521',
  },
  // 9. Sunita Sundaram (Clean match)
  {
    name: 'Sunita Sundaram',
    dob: '1975-07-30',
    gender: 'Female',
    idRef: 'TESTAADHAAR0018',
    voterRef: 'VOTER-DL-2009',
    birthRef: 'BIRTH-DEL-2009',
    epic: 'TN-2009-7530',
    constituency: 'Mylapore (AC-25)',
    state: 'Tamil Nadu',
    polling: 'PS 14, San Thome Higher Sec School',
    address: '12, Luz Church Road, Mylapore, Chennai - 600004',
    pob: 'Govt General Hospital, Chennai',
    father: 'K. Sundaram',
    mother: 'Kalyani Sundaram',
    regNum: 'GCC/B/1975/03145',
  },
  // 10. Manish Tiwari (Clean match)
  {
    name: 'Manish Tiwari',
    dob: '1988-02-25',
    gender: 'Male',
    idRef: 'TESTAADHAAR0019',
    voterRef: 'VOTER-DL-2010',
    birthRef: 'BIRTH-DEL-2010',
    epic: 'UP-2010-8825',
    constituency: 'Lucknow Cantonment (AC-175)',
    state: 'Uttar Pradesh',
    polling: 'PS 9, CMS Gomti Nagar',
    address: '3/114, Vipul Khand, Gomti Nagar, Lucknow - 226010',
    pob: 'KGMU Hospital, Lucknow',
    father: 'R. N. Tiwari',
    mother: 'Geeta Tiwari',
    regNum: 'LMC/B/1988/06412',
  },
  // 11. Deepika Padukone-Bose (Clean match)
  {
    name: 'Deepika Padukone-Bose',
    dob: '1993-10-09',
    gender: 'Female',
    idRef: 'TESTAADHAAR0020',
    voterRef: 'VOTER-DL-2011',
    birthRef: 'BIRTH-DEL-2011',
    epic: 'KA-2011-9310',
    constituency: 'CV Raman Nagar (AC-161)',
    state: 'Karnataka',
    polling: 'PS 21, Defence Colony Club',
    address: '512, 12th Main, Indiranagar, Bengaluru - 560038',
    pob: 'Bowring Hospital, Bengaluru',
    father: 'P. Padukone',
    mother: 'Ujjwala Padukone',
    regNum: 'BBMP/B/1993/11294',
  },
  // 12. Gaurav Bhatia (Clean match)
  {
    name: 'Gaurav Bhatia',
    dob: '1986-06-14',
    gender: 'Male',
    idRef: 'TESTAADHAAR0021',
    voterRef: 'VOTER-DL-2012',
    birthRef: 'BIRTH-DEL-2012',
    epic: 'CH-2012-8614',
    constituency: 'Chandigarh (AC-01)',
    state: 'Chandigarh',
    polling: 'PS 17, Sector 15 Model School',
    address: 'House 1420, Sector 15-B, Chandigarh - 160015',
    pob: 'PGIMER, Chandigarh',
    father: 'Harish Bhatia',
    mother: 'Neelam Bhatia',
    regNum: 'CMC/B/1986/07781',
  },
  // 13. Ananya Ghosh (Clean match)
  {
    name: 'Ananya Ghosh',
    dob: '1997-08-31',
    gender: 'Female',
    idRef: 'TESTAADHAAR0022',
    voterRef: 'VOTER-DL-2013',
    birthRef: 'BIRTH-DEL-2013',
    epic: 'WB-2013-9731',
    constituency: 'Ballygunge (AC-161)',
    state: 'West Bengal',
    polling: 'PS 5, South Point School',
    address: '28/1, Dover Road, Ballygunge, Kolkata - 700019',
    pob: 'AMRI Hospital, Kolkata',
    father: 'Subhash Ghosh',
    mother: 'Maitreyi Ghosh',
    regNum: 'KMC/B/1997/09931',
  },
  // 14. Naveen Patnaik (Clean match)
  {
    name: 'Naveen Patnaik',
    dob: '1980-04-18',
    gender: 'Male',
    idRef: 'TESTAADHAAR0023',
    voterRef: 'VOTER-DL-2014',
    birthRef: 'BIRTH-DEL-2014',
    epic: 'OD-2014-8018',
    constituency: 'Bhubaneswar Central (AC-112)',
    state: 'Odisha',
    polling: 'PS 12, Capital High School',
    address: 'N-2/45, IRC Village, Nayapalli, Bhubaneswar - 751015',
    pob: 'SCB Medical College, Cuttack',
    father: 'B. Patnaik',
    mother: 'Gyan Patnaik',
    regNum: 'BMC/B/1980/04128',
  },
  // 15. Kavita Suresh Patel (Transposed name: NIR has Kavita Suresh Patel vs DLJA has Patel Kavita Suresh)
  {
    name: 'Kavita Suresh Patel',
    dob: '1989-09-15',
    gender: 'Female',
    idRef: 'TESTAADHAAR0024',
    voterRef: 'VOTER-DL-2015',
    birthRef: 'BIRTH-DEL-2015',
    epic: 'GJ-2015-8915',
    constituency: 'Ellisbridge (AC-44)',
    state: 'Gujarat',
    polling: 'PS 18, Gujarat College Hall',
    address: 'Plot 32, Gulbai Tekra, Navrangpura, Ahmedabad - 380009',
    pob: 'Civil Hospital, Ahmedabad',
    father: 'Suresh Patel',
    mother: 'Bhavna Patel',
    regNum: 'AMC/B/1989/08194',
  },
  // 16. Rajesh Kumar Mukherjee (Abbreviated in DTR R. K. Mukherjee vs NIR Rajesh Kumar Mukherjee)
  {
    name: 'Rajesh Kumar Mukherjee',
    dob: '1983-03-21',
    gender: 'Male',
    idRef: 'TESTAADHAAR0025',
    voterRef: 'VOTER-DL-2016',
    birthRef: 'BIRTH-DEL-2016',
    epic: 'WB-2016-8321',
    constituency: 'Alipore (AC-158)',
    state: 'West Bengal',
    polling: 'PS 7, Alipore Multipurpose School',
    address: '15/2, Alipore Park Road, Kolkata - 700027',
    pob: 'SSKM Hospital, Kolkata',
    father: 'N. K. Mukherjee',
    mother: 'Swapna Mukherjee',
    regNum: 'KMC/B/1983/03381',
  },
  // 17. Amitabh Saxena (DOB 1-day diff: NIR 1984-06-15 vs DLJA 1984-06-16)
  {
    name: 'Amitabh Saxena',
    dob: '1984-06-15',
    gender: 'Male',
    idRef: 'TESTAADHAAR0026',
    voterRef: 'VOTER-DL-2017',
    birthRef: 'BIRTH-DEL-2017',
    epic: 'DL-2017-8415',
    constituency: 'Vasant Kunj (AC-43)',
    state: 'Delhi',
    polling: 'PS 20, DPS Vasant Kunj',
    address: 'Pocket B, Flat 204, Sector C, Vasant Kunj, New Delhi - 110070',
    pob: 'AIIMS, New Delhi',
    father: 'B. P. Saxena',
    mother: 'Usha Saxena',
    regNum: 'MCD/B/1984/06152',
  },
  // 18. Siddharth Malhotra (DOB 1-year diff: NIR 1990-12-05 vs DTR 1991-12-05)
  {
    name: 'Siddharth Malhotra',
    dob: '1990-12-05',
    gender: 'Male',
    idRef: 'TESTAADHAAR0027',
    voterRef: 'VOTER-DL-2018',
    birthRef: 'BIRTH-DEL-2018',
    epic: 'DL-2018-9012',
    constituency: 'Greater Kailash (AC-50)',
    state: 'Delhi',
    polling: 'PS 14, Bluebells School',
    address: 'M-48, Greater Kailash II, New Delhi - 110048',
    pob: 'Max Hospital Saket, New Delhi',
    father: 'Sunil Malhotra',
    mother: 'Rimma Malhotra',
    regNum: 'SDMC/B/1990/12051',
  },
  // 19. Vikram Choudhury (Spelling diff: NIR Choudhury vs DLJA Choudhary)
  {
    name: 'Vikram Choudhury',
    dob: '1985-07-11',
    gender: 'Male',
    idRef: 'TESTAADHAAR0028',
    voterRef: 'VOTER-DL-2019',
    birthRef: 'BIRTH-DEL-2019',
    epic: 'KA-2019-8511',
    constituency: 'BTM Layout (AC-152)',
    state: 'Karnataka',
    polling: 'PS 16, Koramangala Indoor Stadium',
    address: '304, 4th Block, 80 Feet Road, Koramangala, Bengaluru - 560034',
    pob: 'St. John Medical College Hospital, Bengaluru',
    father: 'Alok Choudhury',
    mother: 'Sharmila Choudhury',
    regNum: 'BBMP/B/1985/07119',
  },
  // 20. Pooja Sharma (Name discrepancy: NIR Pooja Sharma vs DLJA Pooja Verma)
  {
    name: 'Pooja Sharma',
    dob: '1992-04-02',
    gender: 'Female',
    idRef: 'TESTAADHAAR0029',
    voterRef: 'VOTER-DL-2020',
    birthRef: 'BIRTH-DEL-2020',
    epic: 'DL-2020-9204',
    constituency: 'Model Town (AC-18)',
    state: 'Delhi',
    polling: 'PS 10, Queens Mary School',
    address: 'B-14, Model Town Phase 1, Delhi - 110009',
    pob: 'Sir Ganga Ram Hospital, New Delhi',
    father: 'D. K. Sharma',
    mother: 'Sarita Sharma',
    regNum: 'NDMC/B/1992/04021',
  },
];

const now = new Date().toISOString();

const SEED_DATA = [
  // Preserved original test fixtures
  {
    identityReference: 'TESTAADHAAR0003',
    fields: [
      { name: 'fullName', value: 'Test Citizen Three', verified: true, lastUpdated: now },
      { name: 'dob', value: '1998-04-12', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Male', verified: true, lastUpdated: now },
      { name: 'address', value: 'Synthetic Address, Test District, New Delhi - 110001', verified: true, lastUpdated: now },
    ],
  },
  {
    identityReference: 'TESTAADHAAR0002',
    fields: [
      { name: 'fullName', value: 'Priya Sharma', verified: true, lastUpdated: now },
      { name: 'dob', value: '1995-08-23', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Female', verified: true, lastUpdated: now },
      { name: 'address', value: 'Plot 18, Demo Residency, Satellite, Ahmedabad, Gujarat - 380015', verified: true, lastUpdated: now },
    ],
  },
  {
    identityReference: 'DEMO-ID-9999',
    fields: [
      { name: 'fullName', value: 'Vikram Singh', verified: true, lastUpdated: now },
      { name: 'dob', value: '1988-11-05', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Male', verified: true, lastUpdated: now },
      { name: 'address', value: 'House 55, Green Park Synthetic Enclave, Jaipur, Rajasthan - 302016', verified: true, lastUpdated: now },
    ],
  },
  {
    identityReference: 'SYNTHETIC-001',
    fields: [
      { name: 'fullName', value: 'Sunita Rao', verified: true, lastUpdated: now },
      { name: 'dob', value: '2001-01-30', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Female', verified: true, lastUpdated: now },
      { name: 'address', value: '7th Cross, Indiranagar Demo Layout, Bengaluru, Karnataka - 560038', verified: true, lastUpdated: now },
    ],
  },
  {
    identityReference: 'TEST-USER-ALPHA',
    fields: [
      { name: 'fullName', value: 'Ananya Verma', verified: true, lastUpdated: now },
      { name: 'dob', value: '1992-06-19', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Female', verified: true, lastUpdated: now },
      { name: 'address', value: 'B-12, Civic Center Layout, Test District, New Delhi - 110001', verified: true, lastUpdated: now },
    ],
  },
];

// Generate identity, voter-id, and birth-certificate records for all profiles
for (const p of CITIZEN_PROFILES) {
  // 1. National Identity Registry (Aadhaar)
  SEED_DATA.push({
    identityReference: p.idRef,
    fields: [
      { name: 'fullName', value: p.name, verified: true, lastUpdated: now },
      { name: 'dob', value: p.dob, verified: true, lastUpdated: now },
      { name: 'dateOfBirth', value: p.dob, verified: true, lastUpdated: now },
      { name: 'gender', value: p.gender, verified: true, lastUpdated: now },
      { name: 'address', value: p.address, verified: true, lastUpdated: now },
    ],
  });

  // 2. Voter ID
  SEED_DATA.push({
    identityReference: p.voterRef,
    fields: [
      { name: 'fullName', value: p.name, verified: true, lastUpdated: now },
      { name: 'dob', value: p.dob, verified: true, lastUpdated: now },
      { name: 'gender', value: p.gender, verified: true, lastUpdated: now },
      { name: 'epicNumber', value: p.epic, verified: true, lastUpdated: now },
      { name: 'constituency', value: p.constituency, verified: true, lastUpdated: now },
      { name: 'state', value: p.state, verified: true, lastUpdated: now },
      { name: 'pollingStation', value: p.polling, verified: true, lastUpdated: now },
      { name: 'assemblyPollingStation', value: p.polling, verified: true, lastUpdated: now },
    ],
  });

  // 3. Birth Certificate
  SEED_DATA.push({
    identityReference: p.birthRef,
    fields: [
      { name: 'fullName', value: p.name, verified: true, lastUpdated: now },
      { name: 'dob', value: p.dob, verified: true, lastUpdated: now },
      { name: 'dateOfBirth', value: p.dob, verified: true, lastUpdated: now },
      { name: 'gender', value: p.gender, verified: true, lastUpdated: now },
      { name: 'placeOfBirth', value: p.pob, verified: true, lastUpdated: now },
      { name: 'fatherName', value: p.father, verified: true, lastUpdated: now },
      { name: 'motherName', value: p.mother, verified: true, lastUpdated: now },
      { name: 'registrationNumber', value: p.regNum, verified: true, lastUpdated: now },
    ],
  });
}

// Explicit standard demo reference aliases (matches catalog placeholders e.g. VOTER-DL-000101, BIRTH-DEL-000101)
SEED_DATA.push(
  {
    identityReference: 'VOTER-DL-000101',
    fields: [
      { name: 'fullName', value: 'Aarav Sharma', verified: true, lastUpdated: now },
      { name: 'dob', value: '1988-04-12', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Male', verified: true, lastUpdated: now },
      { name: 'epicNumber', value: 'DL-01-88101', verified: true, lastUpdated: now },
      { name: 'constituency', value: 'New Delhi (AC-40)', verified: true, lastUpdated: now },
      { name: 'state', value: 'Delhi', verified: true, lastUpdated: now },
      { name: 'pollingStation', value: 'PS 4, Barakhamba Road', verified: true, lastUpdated: now },
      { name: 'assemblyPollingStation', value: 'PS 4, Barakhamba Road', verified: true, lastUpdated: now },
    ],
  },
  {
    identityReference: 'BIRTH-DEL-000101',
    fields: [
      { name: 'fullName', value: 'Aarav Sharma', verified: true, lastUpdated: now },
      { name: 'dob', value: '1988-04-12', verified: true, lastUpdated: now },
      { name: 'dateOfBirth', value: '1988-04-12', verified: true, lastUpdated: now },
      { name: 'gender', value: 'Male', verified: true, lastUpdated: now },
      { name: 'placeOfBirth', value: 'Safdarjung Hospital, New Delhi', verified: true, lastUpdated: now },
      { name: 'fatherName', value: 'Suresh Sharma', verified: true, lastUpdated: now },
      { name: 'motherName', value: 'Kamla Sharma', verified: true, lastUpdated: now },
      { name: 'registrationNumber', value: 'NDMC/B/1988/00101', verified: true, lastUpdated: now },
    ],
  }
);


async function seedRegistrations() {
  console.log('[REGISTRATION SEED] Checking database connectivity...');
  const conn = await testConnection();
  if (!conn.connected) {
    console.warn('[REGISTRATION SEED WARNING] Database offline, skipping persistent seed execution.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log(`[REGISTRATION SEED] Seeding ${SEED_DATA.length} synthetic identity references...`);

    for (const item of SEED_DATA) {
      const query = `
        INSERT INTO registrations (identity_reference, status, fields, created_at, updated_at)
        VALUES ($1, 'REGISTERED', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (identity_reference)
        DO UPDATE SET fields = EXCLUDED.fields, updated_at = CURRENT_TIMESTAMP;
      `;
      await client.query(query, [item.identityReference, JSON.stringify(item.fields)]);
      console.log(`  ✓ Seeded: ${item.identityReference}`);
    }

    console.log('[REGISTRATION SEED] All synthetic identifiers seeded successfully.');
  } catch (err) {
    console.error('[REGISTRATION SEED ERROR]:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedRegistrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedRegistrations, SEED_DATA };
