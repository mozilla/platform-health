/* global fetch */
import percentile from 'aggregatejs/percentile';
import { Log } from '../../vendor/logs';
import { selectFrom, toPairs } from '../../vendor/vectors';
import { toQueryString } from '../../vendor/convert';

const TREEHERDER = 'https://treeherder.mozilla.org';
const REPO = 'mozilla-central';
const NINENTY_DAYS = 90 * 24 * 60 * 60;
const signaturesUrl = repo =>
  `${TREEHERDER}/api/project/${repo}/performance/signatures`;
const subtests = async signatureHash => {
  const url = `${signaturesUrl()}/?parent_signature=${signatureHash}`;

  return (await fetch(url)).json();
};

const parentInfo = async ({ suite, platform, framework, option }) => {
  const [options, signatures] = await Promise.all([
    await (await fetch(`${TREEHERDER}/api/optioncollectionhash/`)).json(),
    await (await fetch(
      `${signaturesUrl()}/?framework=${framework}&platform=${platform}&subtests=0`
    )).json(),
  ]);
  // Create a structure with only jobs matching the suite, make
  // option_collection_hash be the key and track the signatureHash as a property
  const optionHashes = selectFrom(options)
    .where({ 'options.0.name': option })
    .select('option_collection_hash')
    .toArray();
  const result = toPairs(signatures)
    .map((v, hash) => ({ ...v, framework: v.framework_id, hash }))
    .where({ suite })
    // eslint-disable-next-line camelcase
    .filter(({ option_collection_hash }) =>
      optionHashes.includes(option_collection_hash)
    )
    .toArray();

  if (result.length !== 1) {
    Log.error('We should have an array of 1 not {{length}}', {
      length: result.length,
    });
  }

  return result[0];
};

const dataUrl = ({
  tests,
  framework,
  repo = REPO,
  interval = NINENTY_DAYS,
}) => {
  const param = {
    framework,
    interval,
    signature_id: toPairs(tests)
      .select('id')
      .toArray(),
  };

  return `${TREEHERDER}/api/project/${repo}/performance/data/?${toQueryString(
    param
  )}`;
};

const perherderGraphUrl = ({
  signatureIds,
  framework,
  repo = REPO,
  timerange = NINENTY_DAYS,
}) => {
  let baseDataUrl = `${TREEHERDER}/perf.html#/graphs?timerange=${timerange}`;

  baseDataUrl += `&${signatureIds
    .map(id => `series=${repo},${id},1,${framework}`)
    .join('&')}`;

  return baseDataUrl;
};

export const adjustedData = (data, percentileThreshold, measure = 'value') => {
  let transformedData = data;

  if (percentileThreshold < 100) {
    const threshold = percentile(
      data.map(d => d[measure]),
      percentileThreshold / 100.0
    );

    transformedData = data.filter(d => d[measure] < threshold);
  }

  return transformedData.map(datum => ({
    ...datum,
    datetime: new Date(datum.push_timestamp * 1000),
  }));
};

const benchmarkData = async ({
  suite,
  platform,
  framework,
  option,
  percentileThreshold = 100,
  includeParentData = true,
}) => {
  const parent = await parentInfo({ suite, platform, framework, option });
  const rawTests = await subtests(parent.hash);
  const tests = toPairs(rawTests)
    .map((v, h) => ({ ...v, hash: h, framework: v.framework_id }))
    .fromPairs();

  if (includeParentData) {
    tests[parent.hash] = parent;
  }

  const signatureIds = toPairs(tests)
    .select('id')
    .toArray();
  // This is a link to a Perfherder graph with all subtests
  const perfherderUrl = perherderGraphUrl({ signatureIds, ...parent });
  // The data contains an object where each key represents a subtest
  // Each data point of that subtest takes the form of:
  // {
  //     job_id: 162620134,
  //     signature_id: 1659462,
  //     id: 414057864,
  //     push_id: 306862,
  //     value: 54.89
  // }
  const dataPoints = await (await fetch(dataUrl({ tests, framework }))).json();
  const data = toPairs(dataPoints)
    .map((dp, subtestHash) => ({
      meta: {
        url: perherderGraphUrl({
          signatureIds: [subtestHash],
          ...tests[subtestHash],
        }),
        ...tests[subtestHash], // Original object from Perfherder
      },
      data: adjustedData(dp, percentileThreshold),
    }))
    .fromPairs();

  return { perfherderUrl, data, parentSignature: parent.parentSignatureHash };
};

export default benchmarkData;
