export interface USERLIST {
  exceptionList: Array<number>
  warnList: Array<{
    id: number,
    count: number,
    warnedAt: number
  }>
  groupLogId: number
}

export interface CONFIG {
  punishment: string,
  isLogged: boolean
}


export interface SessionData {
  userList: USERLIST,
  config: CONFIG
}