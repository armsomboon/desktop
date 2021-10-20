import {
  Repository,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { remote } from 'electron'
import { PullRequest, PullRequestRef } from '../../models/pull-request'
import { API } from '../api'
import {
  createCombinedCheckFromChecks,
  getLatestCheckRunsByName,
  apiStatusToRefCheck,
  apiCheckRunToRefCheck,
  IRefCheck,
} from '../ci-checks/ci-checks'
import { AccountsStore } from './accounts-store'

type OnChecksFailedCallback = (
  repository: RepositoryWithGitHubRepository,
  pullRequest: PullRequest,
  checkRuns: ReadonlyArray<IRefCheck>
) => void

export class NotificationsStore {
  private fakePollingTimeoutId: number | null = null
  private repository: RepositoryWithGitHubRepository | null = null
  private onChecksFailedCallback: OnChecksFailedCallback | null = null
  private accountsStore: AccountsStore

  public constructor(accountsStore: AccountsStore) {
    this.accountsStore = accountsStore
  }

  private unsubscribe() {
    if (this.fakePollingTimeoutId !== null) {
      window.clearTimeout(this.fakePollingTimeoutId)
    }
  }

  private subscribe(repository: RepositoryWithGitHubRepository) {
    this.unsubscribe()

    this.repository = repository

    this.fakePollingTimeoutId = window.setTimeout(() => {
      this.postChecksFailedNotification()
      // this.subscribe(repository)
      // eslint-disable-next-line insecure-random
    }, 1000) //Math.random() * 5000 + 5000)
  }

  public selectRepository(repository: Repository) {
    this.unsubscribe()

    if (!isRepositoryWithGitHubRepository(repository)) {
      return
    }

    this.subscribe(repository)
  }

  private async postChecksFailedNotification() {
    if (this.repository === null) {
      return
    }

    const repository = this.repository

    if (repository.alias !== 'desktop-2') {
      return
    }

    const workflowName = 'CI'
    const prName = 'IGNORE: testing check runs Failing unit test'
    const commitSha = 'ef0edb8'
    const NOTIFICATION_TITLE = 'PR run failed'
    const NOTIFICATION_BODY = `${workflowName} - ${prName} (${commitSha})\nSome jobs were not successful.`
    const notification = new remote.Notification({
      title: NOTIFICATION_TITLE,
      body: NOTIFICATION_BODY,
    })

    const pullRequestRef = new PullRequestRef(
      'Unit-Test---This-is-broken-on-purpose',
      'fabada',
      repository.gitHubRepository
    )
    const baseRef = new PullRequestRef(
      'development',
      'fabada',
      repository.gitHubRepository
    )
    const pullRequest = new PullRequest(
      new Date(),
      prName,
      13013,
      pullRequestRef,
      baseRef,
      'sergiou87',
      false
    )

    const { gitHubRepository } = repository
    const { owner, name, endpoint } = gitHubRepository

    // TODO: make this in a cleaner way
    const accounts = await this.accountsStore.getAll()
    const account = accounts.find(a => a.endpoint === endpoint)

    if (account === undefined) {
      return
    }

    const ref = pullRequest.head.ref
    const api = API.fromAccount(account)

    const [statuses, checkRuns] = await Promise.all([
      api.fetchCombinedRefStatus(owner.login, name, ref),
      api.fetchRefCheckRuns(owner.login, name, ref),
    ])

    const checks = new Array<IRefCheck>()

    if (statuses === null && checkRuns === null) {
      return
    }

    if (statuses !== null) {
      checks.push(...statuses.statuses.map(apiStatusToRefCheck))
    }

    if (checkRuns !== null) {
      const latestCheckRunsByName = getLatestCheckRunsByName(
        checkRuns.check_runs
      )
      checks.push(...latestCheckRunsByName.map(apiCheckRunToRefCheck))
    }

    const check = createCombinedCheckFromChecks(checks)

    if (check === null || check.checks.length === 0) {
      return
    }

    notification.on('click', () => {
      this.onChecksFailedCallback?.(repository, pullRequest, check.checks)
    })

    notification.show()
  }

  public onChecksFailedNotification(callback: OnChecksFailedCallback) {
    this.onChecksFailedCallback = callback
  }
}
