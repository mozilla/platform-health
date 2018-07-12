import { Component } from 'react';
import cx from 'classnames';

import BackendClient from '../../utils/BackendClient';
import Dashboard from '../../dashboard';
import NimbledroidGraphs from '../../components/NimbledroidGraphs';

export default class AndroidV2 extends Component {
  state = { nimbledroidData: {} }

  componentDidMount() {
    this.fetchAndroidData();
  }

  client = new BackendClient();

  async fetchAndroidData() {
    const nimbledroidData = await this.client.getData('nimbledroid');
    this.setState({ nimbledroidData });
  }

  render() {
    const { nimbledroidData } = this.state;
    return (
      <Dashboard
        title='Android'
        subtitle='GeckoView vs WebView Page load (time in seconds, lower is better)'
        className={cx('summary')}
        loading={Object.keys(nimbledroidData).length === 0}
      >
        <div className='row'>
          {Object.keys(nimbledroidData).length > 0 &&
            <NimbledroidGraphs
              nimbledroidData={nimbledroidData}
            />
          }
        </div>
      </Dashboard>
    );
  }
}