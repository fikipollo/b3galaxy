/*
* (C) Copyright 2016 SLU Global Bioinformatics Centre, SLU
* (http://sgbc.slu.se) and the B3Africa Project (http://www.b3africa.org/).
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the GNU Lesser General Public License
* (LGPL) version 3 which accompanies this distribution, and is available at
* http://www.gnu.org/licenses/lgpl.html
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
* Contributors:
*     Rafael Hernandez de Diego <rafahdediego@gmail.com>
*     Tomas Klingström
*     Erik Bongcam-Rudloff
*     and others.
*
* THIS FILE CONTAINS THE FOLLOWING MODULE DECLARATION
* - workflow-run-form
*
*/
(function(){
  var app = angular.module('workflows.controllers.workflow-run', [
    'ui.router',
    'workflows.services.workflow-list',
    'workflows.services.workflow-run',
    'workflows.directives.workflow-run',
  ]);

  /***************************************************************************/
  /*WORKFLOW CONTROLLER*******************************************************/
  /***************************************************************************/
  app.controller('WorkflowRunController', [
    '$state',
    '$scope',
    '$http',
    '$stateParams',
    '$timeout',
    '$interval',
    'WorkflowList',
    'WorkflowInvocationList',
    function($state, $scope, $http, $stateParams, $timeout, $interval, WorkflowList, WorkflowInvocationList){
      //--------------------------------------------------------------------
      // CONTROLLER FUNCTIONS
      //--------------------------------------------------------------------
      /**
      * This function gets the details for a given Workflow
      * @param workflow_id the id for the Workflow to be retieved
      */
      this.retrieveWorkflowDetails  = function(workflow_id){
        $scope.workflow = WorkflowList.getWorkflow(workflow_id);

        if($scope.workflow !== null){
          $http(getHttpRequestConfig("GET","workflow-info", {
            extra: workflow_id})
          ).then(
            function successCallback(response){
              for (var attrname in response.data) {
                $scope.workflow[attrname] = response.data[attrname];
              }
              $scope.workflow.steps = Object.values($scope.workflow.steps);
              //UPDATE VIEW
              $scope.loadingComplete = true;
            },
            function errorCallback(response){
              //TODO: SHOW ERROR MESSAGE
            }
          );
        }else {
          $state.go('workflows');
        }
      };

      //--------------------------------------------------------------------
      // EVENT HANDLERS
      //--------------------------------------------------------------------

      $scope.$on('$destroy', function () {
        //TODO: ASK IF WANT TO LOSE THE DATA
        console.log("Removing interval");
        $interval.cancel(me.checkInvocationInterval);
      });

      this.cancelButtonHandler = function(){
        history.back();
      };

      this.backButtonHandler = function(){
        $scope.invocation.current_step--;
      };

      this.nextStepButtonHandler = function(){
        $scope.invocation.current_step++;

        if($scope.invocation.current_step === 3){
          $scope.invocation.state = "ready";
          $scope.invocation.state_text = "Ready for launch!";

          //Generate the summary
          var html = "";
          var steps = $scope.workflow.steps;
          for(var i in steps){
            debugger;
            if(steps[i].type === "data_input"){
              html +=
              ' <b>' + steps[i].name + (steps[i].id+1) + ':</b>' +
              '<ul>'+
              ' <li>' + steps[i].name + '</li>'+
              ' <li>' + steps[i].inputs[0].name + '<li>'+
              '</ul>'
            }else if(steps[i].extra !== undefined){ //the step was uncollapsed
              var params = requestData.parameters[steps[i].id] = {};
              var inputs = steps[i].extra.inputs
              for(var j in inputs){
                debugger;
              }
            }
          }
          $('#workflow-summary').html(html);
        }
      }

      this.executeWorkflowHandler = function(event){
        $scope.invocation.current_step++;
        $scope.invocation.state = "sending";
        $scope.invocation.state_text = "Sending to Galaxy...";

        //SET THE REQUEST DATA (history id, parameters,...)
        var requestData = {
          "history": "hist_id=" + Cookies.get("current-history"),
          "ds_map": {},
          "parameters": {}
        };

        var steps = $scope.workflow.steps;
        for(var i in steps){
          if(steps[i].type === "data_input"){
            requestData.ds_map[steps[i].id] = {"src" : "hda", "id" : steps[i].inputs[0].value};
          }else if(steps[i].extra !== undefined){ //the step was uncollapsed
            var params = requestData.parameters[steps[i].id] = {};
            var inputs = steps[i].extra.inputs
            for(var j in inputs){
              params[inputs[j].name] = inputs[j].value;
            }
          }
        }
        //SHOW STATE MESSAGE FEW SECONDS BEFORE SEND THE REQUEST
        $timeout( function(){
          $http(getHttpRequestConfig("POST", "workflow-run", {
            extra: $scope.workflow.id,
            headers: {'Content-Type': 'application/json; charset=utf-8'},
            data: requestData
          })).then(
            function successCallback(response){
              //SUCCESSFULLY SENT TO SERVER
              $scope.invocation.state = "success";
              $scope.invocation.state_text = "Success!";
              //SHOW STATE MESSAGE FEW SECONDS
              // $timeout( function(){
                //Update the values for the invocation
                delete response.data.state
                for (var attrname in response.data) {
                  $scope.invocation[attrname] = response.data[attrname];
                }
                //TODO: SAVE THE INVOCATION IN APP DATA
                WorkflowInvocationList.addInvocation($scope.invocation).saveInvocations();

                //Start the interval that checks the state of the invocation
                me.checkInvocationInterval = $interval(me.checkInvocationState, 2000);
              // },
              // 2000);
            },
            function errorCallback(response){
              $scope.invocation.state = "error";
              $scope.invocation.state_text = "Failed.";
            }
          );
        },
        2000);
      };

      this.checkInvocationState = function(){
        $http(getHttpRequestConfig("GET", "invocation-state", {
          extra: [$scope.workflow.id, $scope.invocation.id]
        })).then(
          function successCallback(response){
            var erroneousSteps = 0;
            var waitingSteps = 0;
            var runningSteps = 0;
            var doneSteps = 0;
            var invocation = $scope.invocation;

            delete response.data.state
            for (var attrname in response.data) {
              invocation[attrname] = response.data[attrname];
            }

            for(var i in invocation.steps){
              if(invocation.steps[i].state === null || invocation.steps[i].state === "ok" ){
                doneSteps++;
              }else if(invocation.steps[i].state === 'new'){
                waitingSteps++;
              }else if(invocation.steps[i].state === 'running'){
                runningSteps++;
              }else if(invocation.steps[i].state === 'error'){
                erroneousSteps++;
              }
            }

            if(runningSteps > 0 || waitingSteps > 0){
              invocation.state = "working";
            }else if(erroneousSteps > 0){
              invocation.state = "error";
              //TODO: show summary of results
            }else{
              invocation.state = "success";
              //TODO: show summary of results
            }
          },
          function errorCallback(response){
            $scope.invocation.state = "error";
            $scope.invocation.state_text = "Failed.";
          }
        );
      };

      //--------------------------------------------------------------------
      // INITIALIZATION
      //--------------------------------------------------------------------
      var me = this;

      //The corresponding view will be watching to this variavble
      //and update its content after the http response
      $scope.loadingComplete = false;
      $scope.workflow = null;
      $scope.invocation = WorkflowInvocationList.getNewInvocation();
      this.checkInvocationInterval = null;

      this.retrieveWorkflowDetails($stateParams.id);
    }
  ]);

  /***************************************************************************/
  /*WORKFLOW STEP CONTROLLER *************************************************/
  /***************************************************************************/
  app.controller('WorkflowRunStepController', [
    '$scope',
    '$http',
    '$stateParams',
    'WorkflowList',
    function($scope, $http, $stateParams, WorkflowList){
      //--------------------------------------------------------------------
      // EVENT HANDLERS
      //--------------------------------------------------------------------

      /**
      * toogleCollapseHandler - this function handles the event fired when the
      * user press the button for hide or show the body of a step panel.
      * If it's the first time that the panel is shown, then we need to create
      * the body of the panel, which includes a HTTP request to Galaxy API in
      * order to retrieve the extra information for the step.
      *
      * @param  {type} event the click event
      * @return {type}       description
      */
      this.toogleCollapseHandler = function(event){
        //Toggle collapsed (view will automatically change due to ng-hide directive)
        //TODO: CHANGE THE ICON TO +/-
        $scope.collapsed = !$scope.collapsed;
        //If the remaining data for the step was not loaded yet, send the request
        if(!$scope.loadingComplete){
          //If not an input field
          if($scope.step.type !== "data_input"){
            //If the tool is not an input data tool, request the info from server
            //and store the extra info for the tool at the "extra" field
            $http(getHttpRequestConfig("GET", "tools-info", {
              extra: $scope.step.tool_id})
            ).then(
              function successCallback(response){
                $scope.step["extra"] = response.data;
                //UPDATE VIEW
                $scope.loadingComplete = true;
              },
              function errorCallback(response){
                //TODO: SHOW ERROR MESSAGE
              }
            );
          }else{
            //However, if the tool is an input data field, we need to retrieve the
            //available datasets for current history and display as a selector
            //TODO: GET THE FILES ONLY IF NOT LOADED PREVIOUSLY (AUTO REMOVE AFTER N MINUTES)
            $http(getHttpRequestConfig("GET", "datasets-list", {
              extra: Cookies.get("current-history")})
            ).then(
              function successCallback(response){
                var files = [];

                for(var i in response.data){
                  if(response.data[i].history_content_type === "dataset" && !response.data[i].deleted){
                    files.push(response.data[i]);
                  }
                }

                $scope.step.files = files;
                //UPDATE VIEW
                $scope.loadingComplete = true;
              },
              function errorCallback(response){
                //TODO: SHOW ERROR MESSAGE
              }
            );
          }
        }
      };
      //--------------------------------------------------------------------
      // INITIALIZATION
      //--------------------------------------------------------------------
      //The corresponding view will be watching to this variable
      //and update its content after the http response
      $scope.loadingComplete = false;
      $scope.collapsed = true;
    }
  ]);
})();
