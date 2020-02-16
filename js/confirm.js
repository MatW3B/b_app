var app = angular.module("app");

app.controller("Confirm", [ '$uibModalInstance', 'confirmOptions', function($uibModalInstance, confirmOptions) {

    var ctrl = this;
    ctrl.opt = confirmOptions;

    ctrl.ok = function () { $uibModalInstance.close(); };
    ctrl.cancel = function () { $uibModalInstance.dismiss('cancel'); };

}]);