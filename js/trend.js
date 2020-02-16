app.controller('Trend', [ '$http', 'common', function($http, common) {

	var ctrl = this;
    var firstTransfer = new Date().getTime();
    var lastTransfer = firstTransfer;

    ctrl.lastN = 5;
    
    ctrl.options = {
        chart: {
			type: 'lineChart',
			height: 500,
			margin: { top: 20, right: 20, bottom: 50, left: 55 },
			x: function(d) { return new Date(d.date); },
			y: function(d) { return d.balance_after; },
			showValues: true,
			valueFormat: function(d) {
                return d3.format(',.2f')(d);
            },
			duration: 500,
			xAxis: {
                axisLabel: 'Przelew',
                tickFormat: function(d) {
                    return common.stamp2date(d);
                }
            },
			yAxis: {
                axisLabel: 'Saldo',
                axisLabelDistance: -10
            },
            forceY: [ 0 ],
            padData: true,
            interpolate: 'step-after'
        }		
	};

    ctrl.data = [
        {
            key: "Saldo",
            values: []
        }
    ];
    
    ctrl.refreshData = function() {
        if(ctrl.lastN < 2) ctrl.lastN = 2;
        $http.get('/history?skip=0&limit=' + ctrl.lastN).then(
            function(rep) {
                ctrl.data[0].values = rep.data;
                var len = ctrl.data[0].values.length;
                if(len > 0) {
                    firstTransfer = ctrl.data[0].values[len - 1].date;
                    lastTransfer = ctrl.data[0].values[0].date;
                }
            },
            function(err) {}
        );
    };

    ctrl.refreshData();
}]);