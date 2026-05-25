import type { FormSpec } from '@/schemas/v1/form-spec';

export const fewShotExamples: Array<{ complaint: string; formSpec: FormSpec }> = [
  {
    complaint:
      '58-year-old male, crushing substernal chest pressure radiating to left arm, started 45 minutes ago, diaphoretic.',
    formSpec: {
      triageContext: {
        suspectedCategory: 'Acute coronary syndrome',
        urgency: 'emergent',
        redFlags: [
          'Possible ACS',
          'Pain radiation to left arm',
          'Diaphoresis',
        ],
      },
      sections: [
        {
          id: 'vitals',
          title: 'Vitals',
          fields: [
            {
              id: 'bp_systolic',
              type: 'number',
              label: 'Systolic BP',
              unit: 'mmHg',
              min: 40,
              max: 260,
              required: true,
            },
            {
              id: 'bp_diastolic',
              type: 'number',
              label: 'Diastolic BP',
              unit: 'mmHg',
              min: 20,
              max: 160,
              required: true,
            },
            {
              id: 'pulse',
              type: 'number',
              label: 'Pulse',
              unit: 'bpm',
              min: 20,
              max: 250,
              required: true,
            },
            {
              id: 'spo2',
              type: 'number',
              label: 'SpO₂',
              unit: '%',
              min: 50,
              max: 100,
              required: true,
            },
          ],
        },
        {
          id: 'opqrst',
          title: 'Pain history (OPQRST)',
          fields: [
            {
              id: 'pain_onset',
              type: 'text',
              label: 'When did the pain start?',
              placeholder: 'e.g. 45 minutes ago, at rest',
              required: true,
            },
            {
              id: 'pain_quality',
              type: 'radio',
              label: 'Quality of pain',
              required: true,
              options: [
                { value: 'pressure', label: 'Pressure / squeezing' },
                { value: 'sharp', label: 'Sharp / stabbing' },
                { value: 'burning', label: 'Burning' },
                { value: 'tearing', label: 'Tearing / ripping' },
              ],
            },
            {
              id: 'pain_radiation',
              type: 'multiselect',
              label: 'Pain radiation',
              required: true,
              options: [
                { value: 'left_arm', label: 'Left arm' },
                { value: 'right_arm', label: 'Right arm' },
                { value: 'jaw', label: 'Jaw' },
                { value: 'back', label: 'Back' },
                { value: 'none', label: 'None' },
              ],
            },
            {
              id: 'pain_severity',
              type: 'severity',
              label: 'Pain severity',
              required: true,
            },
          ],
        },
        {
          id: 'cardiac_risk',
          title: 'Cardiac risk factors',
          fields: [
            { id: 'hx_htn', type: 'checkbox', label: 'Hypertension' },
            { id: 'hx_dm', type: 'checkbox', label: 'Diabetes' },
            { id: 'hx_smoker', type: 'checkbox', label: 'Current smoker' },
            { id: 'hx_prior_mi', type: 'checkbox', label: 'Prior MI' },
            {
              id: 'hx_family_cad',
              type: 'checkbox',
              label: 'Family history of premature CAD',
            },
          ],
        },
      ],
    },
  },
  {
    complaint:
      '14-month-old toddler, fever 39.4°C for 2 days, decreased appetite, mild rash on torso.',
    formSpec: {
      triageContext: {
        suspectedCategory: 'Pediatric febrile illness',
        urgency: 'urgent',
        redFlags: ['Fever > 39°C in toddler', 'Rash with fever'],
      },
      sections: [
        {
          id: 'vitals',
          title: 'Vitals',
          fields: [
            {
              id: 'age_months',
              type: 'number',
              label: 'Age',
              unit: 'months',
              min: 0,
              max: 216,
              required: true,
            },
            {
              id: 'temperature_c',
              type: 'number',
              label: 'Temperature',
              unit: '°C',
              min: 32,
              max: 43,
              step: 0.1,
              required: true,
            },
            {
              id: 'temp_route',
              type: 'radio',
              label: 'Temperature route',
              required: true,
              options: [
                { value: 'rectal', label: 'Rectal' },
                { value: 'oral', label: 'Oral' },
                { value: 'axillary', label: 'Axillary' },
                { value: 'tympanic', label: 'Tympanic' },
              ],
            },
            {
              id: 'pulse',
              type: 'number',
              label: 'Pulse',
              unit: 'bpm',
              min: 40,
              max: 220,
            },
          ],
        },
        {
          id: 'fever_history',
          title: 'Fever history',
          fields: [
            {
              id: 'fever_onset',
              type: 'date',
              label: 'Fever onset date',
              required: true,
            },
            {
              id: 'fever_duration_days',
              type: 'number',
              label: 'Duration of fever',
              unit: 'days',
              min: 0,
              max: 30,
            },
            {
              id: 'highest_temp_c',
              type: 'number',
              label: 'Highest recorded temperature',
              unit: '°C',
              min: 32,
              max: 43,
              step: 0.1,
            },
            {
              id: 'antipyretic_response',
              type: 'radio',
              label: 'Response to antipyretics',
              options: [
                { value: 'good', label: 'Resolves with meds' },
                { value: 'partial', label: 'Partial relief' },
                { value: 'none', label: 'No response' },
                { value: 'unknown', label: 'Not given' },
              ],
            },
          ],
        },
        {
          id: 'associated',
          title: 'Associated symptoms',
          fields: [
            {
              id: 'associated_symptoms',
              type: 'multiselect',
              label: 'Associated symptoms',
              options: [
                { value: 'rash', label: 'Rash' },
                { value: 'cough', label: 'Cough' },
                { value: 'vomiting', label: 'Vomiting' },
                { value: 'diarrhea', label: 'Diarrhea' },
                { value: 'ear_pulling', label: 'Pulling at ears' },
                { value: 'lethargy', label: 'Lethargy' },
              ],
            },
            {
              id: 'wet_diapers_24h',
              type: 'number',
              label: 'Wet diapers in last 24h',
              min: 0,
              max: 30,
            },
          ],
        },
        {
          id: 'pmh',
          title: 'History',
          fields: [
            {
              id: 'immunizations_up_to_date',
              type: 'checkbox',
              label: 'Immunizations up to date',
              required: true,
            },
            {
              id: 'sick_contacts',
              type: 'checkbox',
              label: 'Recent sick contacts',
            },
            {
              id: 'recent_travel',
              type: 'text',
              label: 'Recent travel (where, when)',
              placeholder: 'e.g. none, or destination + dates',
            },
          ],
        },
      ],
    },
  },
  {
    complaint:
      '27-year-old female, sudden-onset shortness of breath, palpitations and tingling in fingers; reports recent panic attacks.',
    formSpec: {
      triageContext: {
        suspectedCategory: 'Anxiety / panic attack (rule out PE)',
        urgency: 'urgent',
        redFlags: [
          'Sudden-onset dyspnea — rule out PE',
          'Palpitations',
        ],
      },
      sections: [
        {
          id: 'vitals',
          title: 'Vitals',
          fields: [
            {
              id: 'pulse',
              type: 'number',
              label: 'Pulse',
              unit: 'bpm',
              min: 30,
              max: 220,
              required: true,
            },
            {
              id: 'spo2',
              type: 'number',
              label: 'SpO₂',
              unit: '%',
              min: 60,
              max: 100,
              required: true,
            },
            {
              id: 'resp_rate',
              type: 'number',
              label: 'Respiratory rate',
              unit: '/min',
              min: 6,
              max: 60,
            },
          ],
        },
        {
          id: 'episode',
          title: 'Episode details',
          fields: [
            {
              id: 'symptom_onset',
              type: 'text',
              label: 'When did this episode start?',
              required: true,
            },
            {
              id: 'anxiety_severity',
              type: 'severity',
              label: 'Anxiety severity right now',
              required: true,
            },
            {
              id: 'dyspnea_severity',
              type: 'severity',
              label: 'Shortness of breath severity',
              required: true,
            },
            {
              id: 'episode_triggers',
              type: 'multiselect',
              label: 'Possible triggers',
              options: [
                { value: 'stress', label: 'Acute stress / argument' },
                { value: 'caffeine', label: 'Caffeine' },
                { value: 'stimulant', label: 'Stimulant use' },
                { value: 'lack_sleep', label: 'Lack of sleep' },
                { value: 'unknown', label: 'Unknown' },
              ],
            },
          ],
        },
        {
          id: 'safety',
          title: 'Safety screen',
          fields: [
            {
              id: 'suicidal_ideation',
              type: 'checkbox',
              label: 'Current suicidal ideation',
              required: true,
            },
            {
              id: 'self_harm_history',
              type: 'checkbox',
              label: 'Prior self-harm',
            },
            {
              id: 'substance_use',
              type: 'multiselect',
              label: 'Recent substance use',
              options: [
                { value: 'alcohol', label: 'Alcohol' },
                { value: 'cannabis', label: 'Cannabis' },
                { value: 'stimulants', label: 'Stimulants' },
                { value: 'opioids', label: 'Opioids' },
                { value: 'none', label: 'None' },
              ],
            },
          ],
        },
        {
          id: 'pmh',
          title: 'History',
          fields: [
            {
              id: 'prior_panic_episodes',
              type: 'radio',
              label: 'Prior panic episodes',
              required: true,
              options: [
                { value: 'first', label: 'First episode' },
                { value: 'occasional', label: 'Occasional' },
                { value: 'frequent', label: 'Frequent' },
              ],
            },
            {
              id: 'on_psych_meds',
              type: 'checkbox',
              label: 'Currently on psychiatric medications',
            },
            {
              id: 'recent_pe_risk',
              type: 'checkbox',
              label: 'Recent immobility / surgery / hormone therapy',
            },
          ],
        },
      ],
    },
  },
];
