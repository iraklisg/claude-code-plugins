export type User = { id: string; name: string; role: 'admin' | 'member' }

const users: User[] = [
  { id: '1', name: 'Ada', role: 'admin' },
  { id: '2', name: 'Linus', role: 'member' },
]

export function getUser(id: string): User | undefined {
  return users.find(user => user.id === id)
}
