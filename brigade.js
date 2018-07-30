const { events, Job, Group} = require('brigadier')
const uuidv4 = require('uuid/v4')

const checkRunImage = "technosophos/brigade-github-check-run:latest"

const charts = [
    'brigade',
    'brigade-project',
    'kashti'
]

function lintCharts(e, project) {
    var linter = new Job('chart-lint', 'gcr.io/kubernetes-helm/tiller:canary');
    linter.tasks = [`cd /src`];
    for (let chart of charts) {
        linter.tasks.push(`helm lint ${chart}`);
    }
    return linter.run();
}

function release(e, project) {
    var leaseID = uuidv4();
    var packager = new Job('chart-packager', 'gcr.io/kubernetes-helm/tiller:canary')
    packager.storage.enabled = true;
    packager.tasks = [
        `cd /src`,
        `helm init --client-only`,
    ];
    for (let chart of charts) {
        packager.tasks.push(`helm package ${chart} --destination /mnt/brigade/share`);
    }
    var downloader = new Job('chart-downloader', 'microsoft/azure-cli:latest')
    downloader.storage.enabled = true;
    downloader.env = {
        AZURE_STORAGE_ACCOUNT: project.secrets.azureStorageAccount,
        AZURE_STORAGE_KEY: project.secrets.azureStorageKey,
        AZURE_STORAGE_CONTAINER: project.secrets.azureStorageContainer,
    }
    downloader.tasks = [
        `cd /mnt/brigade/share`,
        `az storage container lease acquire --container-name $AZURE_STORAGE_CONTAINER --lease-duration 60 --proposed-lease-id ${leaseID}`,
        // download the chart repository to merge in with the newly packaged charts
        `mkdir _repo/`,
        `az storage blob download-batch --source $AZURE_STORAGE_CONTAINER --destination _repo/`,
        `cp *.tgz _repo/`
    ];

    var indexer = new Job('chart-indexer', 'gcr.io/kubernetes-helm/tiller:canary')
    indexer.storage.enabled = true;
    indexer.tasks = [
        `cd /mnt/brigade/share/_repo/`,
        `helm repo index .`
    ];

    var releaser = new Job('chart-releaser', 'microsoft/azure-cli:latest')
    releaser.storage.enabled = true;
    releaser.env = {
        AZURE_STORAGE_ACCOUNT: project.secrets.azureStorageAccount,
        AZURE_STORAGE_KEY: project.secrets.azureStorageKey,
        AZURE_STORAGE_CONTAINER: project.secrets.azureStorageContainer,
    }
    releaser.tasks = [
        `cd /mnt/brigade/share`,
        `az storage blob upload-batch --source _repo/ --destination "$AZURE_STORAGE_CONTAINER"`,
        `az storage container lease release --container-name $AZURE_STORAGE_CONTAINER --lease-id ${leaseID}`,
    ];

    return Group.runEach([packager, downloader, indexer, releaser]);
}

function checkRequested(e, p) {
    console.log("check requested")
    // Common configuration
    const env = {
      CHECK_PAYLOAD: e.payload,
      CHECK_NAME: "Chart Tester",
      CHECK_TITLE: "Lint all Helm Charts",
    }

    var linter = new Job('chart-lint', 'gcr.io/kubernetes-helm/tiller:canary');
    linter.tasks = [`cd /src`];
    for (let chart of charts) {
        linter.tasks.push(`helm lint ${chart}`);
    }

    // For convenience, we'll create three jobs: one for each GitHub Check
    // stage.
    const start = new Job("start-run", checkRunImage)
    start.imageForcePull = true
    start.env = env
    start.env.CHECK_SUMMARY = "Beginning test run"

    const end = new Job("end-run", checkRunImage)
    end.imageForcePull = true
    end.env = env

    // Now we run the jobs in order:
    // - Notify GitHub of start
    // - Run the test
    // - Notify GitHub of completion
    //
    // On error, we catch the error and notify GitHub of a failure.
    start.run().then(() => {
      return linter.run()
    }).then( (result) => {
      end.env.CHECK_CONCLUSION = "success"
      end.env.CHECK_SUMMARY = "Build completed"
      end.env.CHECK_TEXT = result.toString()
      return end.run()
    }).catch( (err) => {
      // In this case, we mark the ending failed.
      end.env.CHECK_CONCLUSION = "failed"
      end.env.CHECK_SUMMARY = "Build failed"
      end.env.CHECK_TEXT = `Error: ${ err }`
      return end.run()
    })
  }

events.on('exec', release);
events.on('pull_request', lintCharts);
events.on('push', release);

events.on("check_suite:requested", checkRequested);
events.on("check_suite:rerequested", checkRequested);
events.on("check_run:rerequested", checkRequested);
