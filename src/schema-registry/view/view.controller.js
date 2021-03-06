angularAPP.controller('SubjectsCtrl', function ($rootScope, $scope, $routeParams, $log, $location, SchemaRegistryFactory, UtilsFactory, toastFactory, Avro4ScalaFactory) {

  $log.info("Starting schema-registry controller: view ( " + $routeParams.subject + "/" + $routeParams.version + " )");
  toastFactory.hideToast();

  /**
   * At start-up - get the entire subject `History`
   */
  SchemaRegistryFactory.getSubjectHistory($routeParams.subject).then(
    function success(data) {
      $scope.completeSubjectHistory = SchemaRegistryFactory.getSubjectHistoryDiff(data);
      //$log.warn("Diff is:");
      //$log.warn(JSON.stringify($scope.completeSubjectHistory));
    }
  );

  /**
   * At start-up do something more ...
   */
  if ($routeParams.subject && $routeParams.version) {
    var promise = SchemaRegistryFactory.getSubjectAtVersion($routeParams.subject, $routeParams.version);
    promise.then(function (selectedSubject) {
      $log.info('Success fetching [' + $routeParams.subject + '/' + $routeParams.version + '] with MetaData');
      $rootScope.subjectObject = selectedSubject;
      $rootScope.schema = selectedSubject.Schema.fields;
      $scope.aceString = angular.toJson(selectedSubject.Schema, true);
      $scope.aceStringOriginal = $scope.aceString;
      $scope.aceReady = true;
      SchemaRegistryFactory.getSubjectsVersions($routeParams.subject).then(
        function success(allVersions) {
          var otherVersions = [];
          angular.forEach(allVersions, function (version) {
            if (version != $rootScope.subjectObject.version) {
              otherVersions.push(version);
            }
          });
          $scope.otherVersions = otherVersions;
          $scope.multipleVersionsOn = $scope.otherVersions.length > 0; // TODO remove
        },
        function failure(response) {
          // TODO
        }
      )
    }, function (reason) {
      $log.error('Failed: ' + reason);
    }, function (update) {
      $log.info('Got notification: ' + update);
    });
  }


  $scope.aceString = "";
  $scope.aceStringOriginal = "";
  $scope.multipleVersionsOn = false;

  $scope.isAvroUpdatedAndCompatible = false;
  $scope.testAvroCompatibility = function () {
    $log.debug("Testing Avro compatibility");
    if ($scope.aceString == $scope.aceStringOriginal) {
      toastFactory.showSimpleToastToTop("You have not changed the schema");
    } else {
      if (UtilsFactory.IsJsonString($scope.aceString)) {
        $scope.aceBackgroundColor = "rgba(0, 128, 0, 0.04)";
        $log.debug("Edited schema is a valid json and is a augmented");
        SchemaRegistryFactory.testSchemaCompatibility($routeParams.subject, $scope.aceString).then(
          function success(result) {
            if (result) {
              $log.info("Schema is compatible");
              $scope.aceBackgroundColor = "rgba(0, 128, 0, 0.04)";
              toastFactory.showSimpleToast("You can now evolve the schema");
              $scope.isAvroUpdatedAndCompatible = true;
            } else {
              $scope.aceBackgroundColor = "rgba(255, 255, 0, 0.10)";
              toastFactory.showLongToast("This schema is incompatible with the latest version");
            }
          },
          function failure() {
            $log.error("Could not test compatibility");
          }
        );
      } else {
        $scope.aceBackgroundColor = "rgba(255, 255, 0, 0.10)";
        toastFactory.showLongToast("Invalid Avro");
      }
    }
  };

  $scope.evolveAvroSchema = function () {
    if ($scope.aceString != $scope.aceStringOriginal &&
      UtilsFactory.IsJsonString($scope.aceString)) {
      SchemaRegistryFactory.testSchemaCompatibility($routeParams.subject, $scope.aceString).then(
        function success(result) {
          var latestSchema = SchemaRegistryFactory.getLatestSubjectFromCache($routeParams.subject);
          $log.warn("peiler ");
          $log.warn(latestSchema);
          var latestID = latestSchema.id;
          SchemaRegistryFactory.registerNewSchema($routeParams.subject, $scope.aceString).then(
            function success(schemaId) {
              $log.info("Latest schema ID was : " + latestID);
              $log.info("New    schema ID is  : " + schemaId);
              if (latestID == schemaId) {
                toastFactory.showSimpleToastToTop(" Schema is the same as latest ")
              } else {
                toastFactory.showSimpleToastToTop(" Schema evolved to ID: " + schemaId);
                $location.path('/schema/' + newSubject + '/version/latest');
              }
            },
            function failure(data) {
            }
          );
        },
        function failure(data) {

        }
      );
    } else {
      $scope.aceBackgroundColor = "rgba(255, 255, 0, 0.10)";
      toastFactory.showLongToast("Invalid Avro");
    }
  };

  $scope.isAvroAceEditable = false;
  $scope.aceBackgroundColor = "white";
  $scope.cancelEditor = function () {
    $log.info("Canceling editor");
    $scope.aceBackgroundColor = "white";
    toastFactory.hideToast();
    $log.info("Setting " + $scope.aceStringOriginal);
    $scope.isAvroAceEditable = false;
    $scope.isAvroUpdatedAndCompatible = false;
    $scope.aceString = $scope.aceStringOriginal;
    $scope.aceSchemaSession.setValue($scope.aceString);
  };
  $scope.toggleEditor = function () {
    $scope.isAvroAceEditable = !$scope.isAvroAceEditable;
    if ($scope.isAvroAceEditable) {
      toastFactory.showLongToast("You can now edit the schema");
      $scope.aceBackgroundColor = "rgba(0, 128, 0, 0.04)";
    } else {
      $scope.aceBackgroundColor = "white";
      toastFactory.hideToast();
    }
  };

  /************************* md-table ***********************/
  $scope.tableOptions = {
    rowSelection: false,
    multiSelect: false,
    autoSelect: false,
    decapitate: false,
    largeEditDialog: false,
    boundaryLinks: false,
    limitSelect: true,
    pageSelect: true
  };

  $scope.query = {
    order: 'name',
    limit: 100,
    page: 1
  };

  // This one is called each time - the user clicks on an md-table header (applies sorting)
  $scope.logOrder = function (a) {
    // $log.info("Ordering event " + a);
    sortSchema(a);
  };

  function sortSchema(type) {
    var reverse = 1;
    if (type.indexOf('-') == 0) {
      // remove the - symbol
      type = type.substring(1, type.length);
      reverse = -1;
    }
    // $log.info(type + " " + reverse);
    $scope.schema = UtilsFactory.sortByKey($scope.schema, type, reverse);
  }

  function getScalaFiles(xx) {
    var scala = Avro4ScalaFactory.getScalaFiles(xx);
    $log.error("SCALA-> " + scala);
  }

  /************************* md-table ***********************/
  $scope.editor;

  // When the 'Ace' schema/view is loaded
  $scope.viewSchemaAceLoaded = function (_editor) {
    // $log.info("me");
    $scope.editor = _editor;
    $scope.editor.$blockScrolling = Infinity;
    $scope.aceSchemaSession = _editor.getSession(); // we can get data on changes now
    var lines = $scope.aceString.split("\n").length;
    // TODO : getScalaFiles($scope.aceString);
    // Add one extra line for each command > 110 characters
    angular.forEach($scope.aceString.split("\n"), function (line) {
      lines = lines + Math.floor(line.length / 110);
    });
    if (lines <= 1) {
      lines = 10;
    }
    // $log.warn("Lines loaded for curl create connector -> " + lines + "\n" + $scope.curlCommand);
    _editor.setOptions({
      minLines: lines,
      maxLines: lines,
      highlightActiveLine: false
    });
    // var _renderer = _editor.renderer;
    // _renderer.animatedScroll = false;
  };

  // When the 'Ace' schema/view is CHANGED
  $scope.viewSchemaAceChanged = function (_editor) {
    $scope.editor = _editor;
    var aceString = $scope.aceSchemaSession.getDocument().getValue();
    // $log.warn("LOADED ....");
    // Highlight differences
    var Range = ace.require('ace/range').Range;
    // TODO !!!
    // $scope.aceSchemaSession.addMarker(new Range(2, 5, 4, 16), "ace_diff_new_line", "fullLine");
    $scope.aceString = aceString;
  };

}); //end of controller

// Useful for browsing through different versions of a schema
angularAPP.directive('clickLink', ['$location', function ($location) {
  return {
    link: function (scope, element, attrs) {
      element.on('click', function () {
        scope.$apply(function () {
          $location.path(attrs.clickLink);
        });
      });
    }
  }
}]);
