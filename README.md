# Helm Charts for Brigade

This repository contains [Helm](https://helm.sh/) charts for use with [Brigade](https://brigade.sh), the platform for event-based scripting for Kubernetes.

## Installing Charts

All of the charts herein are stored in a
[Helm chart repository](https://github.com/kubernetes/helm/blob/master/docs/chart_repository.md).

First, add the charts repository to your local list:

```console
helm repo add brigade https://charts.f1sh.ca
```

After you've added the charts repository, you'll have access to the charts you see here. You can search for charts using `helm search briagde`.

## Contributing

This project welcomes contributions and suggestions. All contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
