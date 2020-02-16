app.controller("Transfer", [ '$http', '$scope', 'common','$uibModal', function($http, $scope, common, $uibModal) {
    var ctrl = this;
    
    ctrl.account = {};
    ctrl.emails = [];
    ctrl.selected= 0;

    var initVars = function() {
        ctrl.transaction = { recipient: "", amount: "", description: "" };
    };

    initVars();

    var refreshAccount = function() {
        $http.get('/account').then(function (rep) {
            ctrl.account = rep.data;
        }, function(err) {});
    };

    refreshAccount();

    $http.get('/recipients').then(function(rep) {
        ctrl.emails = rep.data;
    }, function(err) { console.log('Failed to receive recipient emails')});

    $http.get('/templates').then(  
        function(rep) {ctrl.templates = rep.data; ctrl.templates.unshift({name:'', recipient: "", amount: "", description: "" });}, 
        function(err) {});

    ctrl.doTransfer = function() {
        $http.post('/account', ctrl.transaction).then(
            function (rep) {
                ctrl.account = rep.data;
                common.showMessage('Przelew udany');
                initVars();
            },
            function (err) {
                common.showError('Przelew nieudany, czy odbiorca jest poprawny?');
            }
        );
    };

    ctrl.saveTemplate = function(){
        
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title-top',
            ariaDescribedBy: 'modal-body-top',
            templateUrl: '/html/templateDialog.html',
            controller: 'templateDialog',
            controllerAs: 'ctrl'
        });
        modalInstance.result.then(
            function(data) {
                console.log(data);
                ctrl.template = {name: data, 
                                recipient:ctrl.templates[ctrl.selected].recipient, 
                                amount:ctrl.templates[ctrl.selected].amount, 
                                description:ctrl.templates[ctrl.selected].description
                            };
                $http.post('/templates', ctrl.template).then(
                    function (rep) {
                        common.showMessage('Szablon zapisany');
                    },
                    function (err) {
                        common.showError('Szablon nie jest poprawny!');
                    }
                );
            });
    };

    ctrl.updateTransaction = function(){
        ctrl.transaction.recipient=ctrl.templates[ctrl.selected].recipient;
        ctrl.transaction.amount=ctrl.templates[ctrl.selected].amount;
        ctrl.transaction.description=ctrl.templates[ctrl.selected].description;  
    }

    ctrl.updateTemplate = function(){
        if(ctrl.selected){
            ctrl.templates[ctrl.selected].recipient=ctrl.transaction.recipient;
            ctrl.templates[ctrl.selected].amount=ctrl.transaction.amount;
            ctrl.templates[ctrl.selected].description=ctrl.transaction.description;      
            };
        };

    ctrl.formInvalid = function() {
        return ctrl.transaction.amount <= 0 || ctrl.account.balance - ctrl.transaction.amount < ctrl.account.limit;
    };

    $scope.$on('transfer', function(event, obj) {
        refreshAccount();
    });
}]);

app.controller("templateDialog", [ '$uibModalInstance','common' ,function($uibModalInstance,common) {
    var ctrl = this;
    ctrl.loginError = false;

    ctrl.tryNaming = function() { 
            $uibModalInstance.close(ctrl.name);        
    };

    ctrl.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

}]);
