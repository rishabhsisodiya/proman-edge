export interface MockUser {
  username: string
  password: string
  fullName: string
  role: string
  roleSlug: string
  companies: string[]   // array — 1 company, subset, or all 5
  email: string
}

export const ALL_COMPANIES = ['PISPL', 'ACE', 'PROMAX', 'BLUESTONE', 'QMSPRO']

export const MOCK_USERS: MockUser[] = [
  {
    username: 'satheesh',
    password: 'password',
    fullName: 'Satheesh Kumar',
    role: 'Sales Head',
    roleSlug: 'sales-head',
    companies: ['PISPL'],          // update to e.g. ['PISPL','ACE','PROMAX'] once confirmed
    email: 'satheesh@proman.in',
  },
  {
    username: 'manoj',
    password: 'password',
    fullName: 'Manoj Sharma',
    role: 'Manufacturing Head',
    roleSlug: 'manufacturing-head',
    companies: ['PISPL'],
    email: 'manoj@proman.in',
  },
  {
    username: 'lakshman',
    password: 'password',
    fullName: 'Lakshman Rao',
    role: 'Finance Head',
    roleSlug: 'finance-head',
    companies: ALL_COMPANIES,
    email: 'lakshman@proman.in',
  },
  {
    username: 'prashant',
    password: 'password',
    fullName: 'Prashant Kumar',
    role: 'MD',
    roleSlug: 'md',
    companies: ALL_COMPANIES,
    email: 'prashant@proman.in',
  },
  {
    username: 'vijayakumar',
    password: 'password',
    fullName: 'Vijayakumar Nair',
    role: 'Engineering Head',
    roleSlug: 'engineering-head',
    companies: ['PISPL'],
    email: 'vijayakumar@proman.in',
  },
  {
    username: 'procurement',
    password: 'password',
    fullName: 'Procurement Head',
    role: 'Procurement Head',
    roleSlug: 'procurement-head',
    companies: ['PISPL'],
    email: 'procurement@proman.in',
  },
]
