import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { CICheckRunList } from '../check-runs/ci-check-run-list'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { CICheckRunLogs } from '../check-runs/ci-check-run-item-logs'

interface IPullRequestChecksFailedProps {
  readonly dispatcher: Dispatcher
  readonly shouldChangeRepository: boolean
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly checks: ReadonlyArray<IRefCheck>
  readonly onSubmit: () => void
  readonly onDismissed: () => void
}

interface IPullRequestChecksFailedState {
  readonly loading: boolean
  readonly selectedCheck: IRefCheck
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
    this.state = { loading: false, selectedCheck }
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
                checkRuns={this.props.checks}
                loadingActionLogs={false}
                loadingActionWorkflows={false}
                showLogsInline={false}
                selectable={true}
                onViewOnGitHub={this.onViewOnGitHub}
                onCheckRunClick={this.onCheckRunClick}
              />
              {this.state.selectedCheck && (
                <CICheckRunLogs
                  checkRun={this.state.selectedCheck}
                  loadingActionLogs={false}
                  loadingActionWorkflows={false}
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

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.setState({ selectedCheck: checkRun })
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
