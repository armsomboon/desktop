import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { CICheckRunList } from '../check-runs/ci-check-run-list'
import {
  IRefCheck,
  getLatestPRWorkflowRunsLogsForCheckRun,
  getCheckRunActionsJobsAndLogURLS,
} from '../../lib/ci-checks/ci-checks'
import { CICheckRunLogs } from '../check-runs/ci-check-run-item-logs'
import { Account } from '../../models/account'
import { API } from '../../lib/api'

interface IPullRequestChecksFailedProps {
  readonly dispatcher: Dispatcher
  readonly shouldChangeRepository: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly checks: ReadonlyArray<IRefCheck>
  readonly onSubmit: () => void
  readonly onDismissed: () => void
}

interface IPullRequestChecksFailedState {
  readonly loading: boolean
  readonly selectedCheckID: number
  readonly checks: ReadonlyArray<IRefCheck>
  readonly loadingActionWorkflows: boolean
  readonly loadingActionLogs: boolean
}

/**
 * Dialog prompts the user the passphrase of an SSH key.
 */
export class PullRequestChecksFailed extends React.Component<
  IPullRequestChecksFailedProps,
  IPullRequestChecksFailedState
> {
  public constructor(props: IPullRequestChecksFailedProps) {
    super(props)

    const { checks } = this.props

    const selectedCheck =
      checks.find(check => check.conclusion === 'failure') ?? checks[0]
    this.state = {
      loading: false,
      selectedCheckID: selectedCheck.id,
      checks,
      loadingActionWorkflows: true,
      loadingActionLogs: true,
    }
  }

  public render() {
    let okButtonTitle = __DARWIN__
      ? 'Switch to Pull Request'
      : 'Switch to pull request'

    if (this.props.shouldChangeRepository) {
      okButtonTitle = __DARWIN__
        ? 'Switch to Repository and Pull Request'
        : 'Switch to repository and pull request'
    }

    const dialogTitle = __DARWIN__
      ? 'Pull Request Checks Failed'
      : 'Pull request checks failed'

    const selectedCheck = this.state.checks.find(
      check => check.id === this.state.selectedCheckID
    )

    return (
      <Dialog
        id="pull-request-checks-failed"
        type="normal"
        title={dialogTitle}
        dismissable={false}
        onSubmit={this.props.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}
      >
        <DialogContent>
          <Row>
            <span style={{ display: 'inline-block' }}>
              Some checks failed in your pull request{' '}
              <span style={{ fontWeight: 'bold' }}>
                {this.props.pullRequest.title}
              </span>{' '}
              <span style={{ fontWeight: 'bold', color: 'rgb(87, 96, 106)' }}>
                #{this.props.pullRequest.pullRequestNumber}
              </span>
            </span>
          </Row>
          <Row>
            <div className={'ci-check-run-dialog-container'}>
              <CICheckRunList
                checkRuns={this.state.checks}
                loadingActionLogs={this.state.loadingActionLogs}
                loadingActionWorkflows={this.state.loadingActionWorkflows}
                showLogsInline={false}
                selectable={true}
                selectedCheckRun={selectedCheck}
                onViewOnGitHub={this.onViewOnGitHub}
                onCheckRunClick={this.onCheckRunClick}
              />
              {selectedCheck !== undefined && (
                <CICheckRunLogs
                  checkRun={selectedCheck}
                  loadingActionLogs={this.state.loadingActionLogs}
                  loadingActionWorkflows={this.state.loadingActionWorkflows}
                  onViewOnGitHub={this.onViewOnGitHub}
                />
              )}
            </div>
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            onCancelButtonClick={this.props.onDismissed}
            cancelButtonText="Dismiss"
            okButtonText={okButtonTitle}
            onOkButtonClick={this.onSubmit}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  public componentDidMount() {
    this.loadCheckRunLogs()
  }

  private async loadCheckRunLogs() {
    const { gitHubRepository } = this.props.repository
    const { pullRequest } = this.props

    const account = this.props.accounts.find(
      a => a.endpoint === gitHubRepository.endpoint
    )

    if (account === undefined) {
      this.setState({
        loadingActionWorkflows: false,
        loadingActionLogs: false,
      })
      return
    }

    const api = API.fromAccount(account)

    /*
      Until we retrieve the actions workflows, we don't know if a check run has
      action logs to output, thus, we want to show loading until then. However,
      once the workflows have been retrieved and since the logs retrieval and
      parsing can be noticeably time consuming. We go ahead and flip a flag so
      that we know we can go ahead and display the checkrun `output` content if
      a check run does not have action logs to retrieve/parse.
    */
    const checkRunsWithActionsUrls = await getCheckRunActionsJobsAndLogURLS(
      api,
      gitHubRepository.owner.login,
      gitHubRepository.name,
      pullRequest.head.ref,
      this.props.checks
    )

    // When the component unmounts, this is set to null. This check will help us
    // prevent using set state on an unmounted component it it is unmounted
    // before above api returns.
    // if (this.statusSubscription === null) {
    //   return
    // }

    this.setState({
      checks: checkRunsWithActionsUrls,
      loadingActionWorkflows: false,
    })

    const checks = await getLatestPRWorkflowRunsLogsForCheckRun(
      api,
      gitHubRepository.owner.login,
      gitHubRepository.name,
      checkRunsWithActionsUrls
    )

    // When the component unmounts, this is set to null. This check will help us
    // prevent using set state on an unmounted component it it is unmounted
    // before above api returns.
    // if (this.statusSubscription === null) {
    //   return
    // }

    this.setState({ checks, loadingActionLogs: false })
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.setState({ selectedCheckID: checkRun.id })
  }

  private onViewOnGitHub = (checkRun: IRefCheck) => {
    const { repository, pullRequest, dispatcher } = this.props

    // Some checks do not provide htmlURLS like ones for the legacy status
    // object as they do not have a view in the checks screen. In that case we
    // will just open the PR and they can navigate from there... a little
    // dissatisfying tho more of an edgecase anyways.
    const url =
      checkRun.htmlUrl ??
      `${repository.gitHubRepository.htmlURL}/pull/${pullRequest.pullRequestNumber}`
    if (url === null) {
      // The repository should have a htmlURL.
      return
    }
    dispatcher.openInBrowser(url)
  }

  private onSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const { dispatcher, repository, pullRequest } = this.props

    this.setState({ loading: true })
    await dispatcher.selectRepository(repository)
    await dispatcher.checkoutPullRequest(repository, pullRequest)
    this.setState({ loading: false })

    this.props.onDismissed()
  }
}
