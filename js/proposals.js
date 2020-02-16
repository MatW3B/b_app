app.controller("Proposals", [ '$http', 'globals', 'common', function($http, globals, common) {
    var ctrl = this;
  
    ctrl.email = globals.email;
    ctrl.type = globals.type;
    var initVars = function() {
        ctrl.proposalCount = 0;
        ctrl.filter = '';
        ctrl.limit=5
        ctrl.selected = null;
        ctrl.selectedEntryType = null;
        ctrl.statusFilter = ['active','awaiting','refused'];
        ctrl.types = ["user","employee"];
    };

    initVars();

    ctrl.refreshProposals = function() {
        $http.delete('/proposals').then(
            function(rep) { ctrl.proposalCount = rep.data.count; },
            function(err) {}
        );
        $http.get('/proposals?skip=0'+'&filter=' + ctrl.filter +'&limit=' +ctrl.limit).then(
            function(rep) { ctrl.proposals = rep.data; },
            function(err) {}
        );
    };

    ctrl.editProposal = function(_id,option){
        $http.post('/proposals?option='+option,JSON.stringify(_id)).then(
            function(rep)   
            {
                common.showMessage('Wniosek został pomyślnie zmieniony!');
                ctrl.refreshProposals();
                },
            function(err){}
        );
    };


    ctrl.stamp2date = common.stamp2date;
    
    ctrl.refreshProposals();

}]);