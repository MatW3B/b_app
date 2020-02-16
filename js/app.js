var app = angular.module("app", ['ngSanitize', 'ngRoute', 'ngAnimate','ngCookies', 'ngWebSocket', 'ui.bootstrap', 'nvd3']);

// zmienne globalne
app.value('globals', {
    email: '',
    type: '',
    session:''
});

// nowe podstrony i ich kontrolery
app.constant('routes', [
	{ route: '/', templateUrl: '/html/home.html', controller: 'Home', controllerAs: 'ctrl', menu: '<i class="fa fa-lg fa-home"></i>', guest: true },
	{ route: '/transfer', templateUrl: '/html/transfer.html', controller: 'Transfer', controllerAs: 'ctrl', menu: 'Przelew' },
    { route: '/history', templateUrl: '/html/history.html', controller: 'History', controllerAs: 'ctrl', menu: 'Historia' },
    { route: '/proposals', templateUrl: '/html/proposals.html', controller: 'Proposals', controllerAs: 'ctrl', menu: 'Użytkownicy', employee: true },
    { route: '/trend', templateUrl: '/html/trend.html', controller: 'Trend', controllerAs: 'ctrl', menu: 'Trend' }    
]);

app.config(['$routeProvider', '$locationProvider', 'routes', function($routeProvider, $locationProvider, routes) {
    $locationProvider.hashPrefix('');
	for(var i in routes) {
		$routeProvider.when(routes[i].route, routes[i]);
	}
	$routeProvider.otherwise({ redirectTo: '/' });
}]);

app.factory('ws', function($websocket, common) {

    var dataStream = $websocket('ws://' + window.location.host);

    dataStream.onMessage(function(message) {
        // handling data received from websocket
        try {
            var data = JSON.parse(message.data);
            switch (data.action) {
                case 'init':
                    console.log(data.text);
                    break;
                case 'userTypeChange':
                    common.showMessage(data.text);
                    break;
                default:
                    console.log('Unknown action sent from websocket: ' + message.action);
            }
        } catch(err) {
            console.log(err);
            console.error('Error during parsing data from websocket: ' + message.data);
        }
    });

    return {

        init: function(session) {
            dataStream.send(JSON.stringify({ action: 'init', text: 'Websocket initialization', session: session }));
        },

        send: function(message) {
            dataStream.send(message);
        }

    };

});


app.controller("accountDialog", [ '$http', '$uibModalInstance','common' ,function($http, $uibModalInstance,common) {
    var ctrl = this;
    ctrl.loginError = false;
    ctrl.creds = {email: '', password: ''};
    ctrl.passwordRe = '';

    ctrl.passwordCheck = function() {
        if(ctrl.passwordRe != ctrl.creds.password) accountForm$invalid;
    }

    ctrl.tryCreate = function() {
        $http.post('/accountForm', ctrl.creds).then(
            function(rep) {
                common.showMessage('Wniosek o stworzenie konta wysłany!');
                $uibModalInstance.close();
            },
            function(err) {
                ctrl.loginError = true;
            }
        );
    };

    ctrl.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

}]);

app.controller("loginDialog", [ '$http', '$uibModalInstance','$uibModal','$location','globals', function($http, $uibModalInstance, $uibModal,$location,globals) {
    var ctrl = this;
    // devel: dla szybszego logowania
    ctrl.creds = { email: 'jim@beam.com', password: 'admin1' };
    ctrl.loginError = false;
    ctrl.loginErrorMessage = '';

    ctrl.tryLogin = function() {
        $http.post('/login', ctrl.creds).then(
            function(rep) {
                $uibModalInstance.close(rep.data);
            },
            function(err) {
                ctrl.loginErrorMessage = err.data.error;
                ctrl.loginError = true;
            }
        );
    };

    ctrl.moveToAccount = function(){
        ctrl.cancel();
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title-top',
            ariaDescribedBy: 'modal-body-top',
            templateUrl: '/html/accountDialog.html',
            controller: 'accountDialog',
            controllerAs: 'ctrl'
        });
        modalInstance.result.then(
            function(data) {
                $location.path('/');
            });
    };

    ctrl.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

}]);

app.controller('Menu', ['$http', '$cookies', '$scope', '$location', '$uibModal', '$websocket', 'routes', 'globals', 'common','ws',
	function($http, $cookies, $scope, $location, $uibModal, $websocket, routes, globals, common,ws) {
        var ctrl = this;
        globals.session = $cookies.get('session');
        ctrl.alert = common.alert;
        ctrl.menu = [];

        var refreshMenu = function() {
            ctrl.menu = [];

            if(globals.type == "employee"){
                ws.init(globals.session);
            }

            for (var i in routes) {
                if(routes[i].guest || globals.email) {
                    if (globals.type != "employee" && routes[i].employee) {
                        continue;
                    }
                    ctrl.menu.push({route: routes[i].route, title: routes[i].menu});
                }
            }
        };

        $http.get('/login').then(
            function(rep) { 
                globals.email = rep.data.email; 
                globals.type = rep.data.type;
                refreshMenu();
            
            },
            function(err) { 
                globals.email = null; 
                globals.type = null; 
            }
        );

        ctrl.isCollapsed = true;

        $scope.$on('$routeChangeSuccess', function () {
            ctrl.isCollapsed = true;
        });

		ctrl.navClass = function(page) {
			return page === $location.path() ? 'active' : '';
		}

		ctrl.loginIcon = function() {
			return globals.email ? globals.email + '&nbsp;<span class="fa fa-lg fa-sign-out"></span>' : '<span class="fa fa-lg fa-sign-in"></span>';
		}

        ctrl.login = function() {
            if(globals.email) {
                common.confirm({ title: 'Koniec pracy?', body: 'Chcesz wylogować ' + globals.email + '?' }, function(answer) {
                    if(answer) {    
                        $http.delete('/login').then(
                            function(rep) {
                                globals.email = '';
                                globals.type = '';
                                $location.path('/');
                                refreshMenu();
                            },
                            function(err) {}
                        );
                    }
                });    
            } else {
                var modalInstance = $uibModal.open({
                    animation: true,
                    ariaLabelledBy: 'modal-title-top',
                    ariaDescribedBy: 'modal-body-top',
                    templateUrl: '/html/loginDialog.html',
                    controller: 'loginDialog',
                    controllerAs: 'ctrl'
                });
                modalInstance.result.then(
                    function(data) {
                        globals.email = data.email;
                        globals.type = data.type;
                        $location.path('/');
                        refreshMenu();
                    });
            }};

            refreshMenu();
            
        ctrl.closeAlert = function() { ctrl.alert.text = ""; };
}]);

/*
    common.confirm( { title: title, body: body, noOk: false, noCancel: false } , function(answer) { ... } )
    common.showMessage( message )
    common.showError( message )
*/
app.service('common', [ '$uibModal', 'globals', function($uibModal, globals) {

    this.confirm = function(confirmOptions, callback) {

        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title-top',
            ariaDescribedBy: 'modal-body-top',
            templateUrl: '/html/confirm.html',
            controller: 'Confirm',
            controllerAs: 'ctrl',
            resolve: {
                confirmOptions: function () {
                    return confirmOptions;
                }
            }
        });

        modalInstance.result.then(
            function () { callback(true); },
            function (ret) { callback(false); }
        );
    };

    this.alert = { text: '', type: '' };
    
    this.showMessage = function(msg) {
        this.alert.type = 'alert-success';
        this.alert.text = msg;
    };

    this.showError = function(msg) {
        this.alert.type = 'alert-danger';
        this.alert.text = msg;
    };

    this.stamp2date = function(stamp) {
        return new Date(stamp).toLocaleString();
    };
    
}]);