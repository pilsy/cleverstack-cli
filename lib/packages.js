var request = require( 'request' )
  , Promise = require( 'bluebird' )
  , zlib    = require( 'zlib' )
  , async   = require( 'async' )
  , path    = require( 'path' )
  , fs      = require( 'fs' )
  , ncp     = require( 'ncp' )
  , rimraf  = require( 'rimraf' )
  , spawn   = require( 'win-spawn' )
  , semver  = require( 'semver' )
  , findit  = require( 'findit' )
  , tar     = require( 'tar' )
  , utils   = require( path.join( __dirname, 'utils' ) )

/**
 * Downloads from GitHub or the optional url param
 * then it will unzip and extract into dir
 *
 * @param  {Object} pkg
 * @param  {String=} url
 * @param  {String} dir
 * @return {Promise}
 * @api public
 */

var get = exports.get = function ( pkg, url, dir ) {
  var def = Promise.defer( )

  if (arguments.length < 3) {
    pkg.name = pkg.name.split( '@' )[ 0 ];
    dir = url;
    url = 'https://api.github.com/repos/' + pkg.owner + '/' + pkg.name + '/tarball/master';
  }

  if (pkg.name.indexOf( '@' ) > -1) {
    var Pkg = pkg.name.split( '@' );
    url = 'https://github.com/' + pkg.owner + '/' + Pkg[ 0 ] + '/archive/' + Pkg[ 1 ] + '.tar.gz';
    // url = 'https://api.github.com/repos/' + pkg.owner + '/' + Pkg[ 0 ] + '/tarball/' + Pkg[ 1 ];
  }

  request( url, { headers: { 'User-Agent': 'cleverstack' } } )
  .pipe( zlib.Unzip( ) )
  .pipe( tar.Extract( { strip: 1, path: dir } ) )
  .on( 'error', function ( err ) {
    def.reject( err );
  } )
  .on( 'end', function ( ) {
    def.resolve( );
  } );

  return def.promise;
}

/**
 * Finds bower/package.json file, checks for the actual name, and returns
 * the name of the module and a type (frontend or backend) module.
 *
 * @param  {Object[]} locations
 * @param  {String} moduleName
 * @param  {String} moduleVersion
 * @param  {String} [check=gt] Semver version satisfying ('gt' or 'lt')
 * @return {Promise}
 * @api public
 */

exports.findConfigAndVersionForModule = function ( locations, moduleName, moduleVersion, check ) {
  var def = Promise.defer( );

  if (typeof check === "undefined" || check !== "lt") {
    check = 'gt';
  }

  // Detect the first location that we find..
  // and make sure the location matches npm/bower.json
  async.filter( locations, function ( location, next ) {
    var loc   = path.join( location.moduleDir, location.modulePath, moduleName )
      , walk  = findit( loc )
      , found = false;

    walk.on( 'directory', function ( dir, stat, stop ) {
      if (dir !== loc) {
        return stop( );
      }
    } );

    walk.on( 'file', function ( pkgFilePath ) {
      var pkgFileName = path.basename( pkgFilePath );

      if ( [ 'package.json', 'bower.json' ].indexOf( pkgFileName ) > -1) {
        var jsonConfig = require( pkgFilePath );

        if (pkgFileName.indexOf( 'package.json' ) > -1 && location.name === "frontend") {
          lib.utils.fail( moduleName + ' is a backend module, please install from your project\'s root directory.', true );
        }
        else if (pkgFileName.indexOf( 'bower.json' ) > -1 && location.name === "backend") {
          lib.utils.fail( moduleName + ' is a backend module, please install from your project\'s root directory.', true );
        }
        else if (semver[ check ]( jsonConfig.version, moduleVersion )) {
          lib.utils.fail( moduleName + '\'s version is already ' + (check === "gt" ? 'greater' : 'lesser' ) + ' than ' + moduleVersion + ' (currently at version ' + jsonConfig.version + ')', true );
        }
        else if (semver.eq( jsonConfig.version, moduleVersion )) {
          lib.utils.fail( moduleName + ' is already at version' + jsonConfig.version, true );
        }
        else if (jsonConfig.name === moduleName) {
          found = true;
          module = {
            name: moduleName + ( moduleVersion !== "*" ? '@' + moduleVersion : '' ),
            type:[ 'package.json' ].indexOf( pkgFileName ) > -1 ? 'backend' : 'frontend'
          };
          walk.stop( );
        }
      }
    } );

    walk.on( 'end', function ( ) {
      next( found );
    } );
  },
  function ( _location ) {
    def.resolve( _location.length > 0 ? module : false );
  } );

  return def.promise;
}

/**
 * Installs bower components into the correct path for
 * the frontend seed
 *
 * @param  {Object} location
 * @param  {Array} packages
 * @return {Promise}
 * @api public
 */

var installFrontendModules = exports.installFrontendModules = function ( location, packages ) {
  var def = Promise.defer( );

  async.each( packages, function ( pkg, next ) {
    utils.info( 'Checking bower.json file for instructions within ' + pkg.name);

    var bowerFile = path.join( location.moduleDir, location.modulePath, pkg.name, 'bower.json' );

    if (!fs.existsSync( bowerFile )) {
      return next( );
    }

    var bowerJson       = require( bowerFile )
      , name            = typeof bowerJson.rename === "string" ? bowerJson.rename : pkg.name
      , moduleLocation  = path.resolve( path.join( location.moduleDir, location.modulePath, name ) );

    if (fs.existsSync( moduleLocation ) || path.dirname( bowerFile ) === moduleLocation) {
      return next( );
    }

    ncp( path.dirname( bowerFile ), moduleLocation, function ( err ) {
      if (!!err) {
        return def.reject( err );
      }

      rimraf( path.dirname( bowerFile ), function ( err ) {
        if (!!err) {
          return def.reject( err );
        }

        utils.success( 'Finished renaming ' + pkg.name );
        next( );
      } );
    } );
  },
  function ( err ) {
    if (!!err) {
      return def.reject( err );
    }

    def.resolve( );
  } );

  return def.promise;
}

/**
 * Installs Bower packages within the frontend seed.
 *
 * @param  {Object} location
 * @param  {Array} packages
 * @return {Promise}
 * @api public
 */

exports.installWithBower = function ( location, packages ) {
  var def     = Promise.defer( );

  async.each( packages, function ( pkg, next ) {
    if (!pkg.hasOwnProperty( 'url' )) {
      return next( );
    }

    var dir = path.join( location.moduleDir, location.modulePath, pkg.name.split( '@' )[ 0 ] );

    get( pkg, dir )
    .then( function ( ) {
      utils.success( 'Installed ' + pkg.name.split( '@' )[ 0 ] );
      next( );
    } )
    .catch( function ( err ) {
      next( err );
    } );
  }, function ( err ) {
    if (!!err) {
      return def.reject( err );
    }

    installFrontendModules( location, packages )
    .then( function ( ) {
      def.resolve( );
    } )
    .catch( function ( err ) {
      def.reject( err );
    } );
  } );

  return def.promise;
}

/**
 * Installs NPM packages (from modules) and installs any dependencies
 * The reason why we need to do each package one-by-one
 * is due to the fact that we need to utilize the --prefix
 * npm option. Which sets the current node_module path
 *
 * @param  {Object} location
 * @param  {Array} packages
 * @return {Promise}
 * @api public
 */

// todo: Strip out the need for npm install and directly use the installWithNPM() function
var installNpmModules = exports.installNpmModules = function ( location, packages ) {
  var def     = Promise.defer( );

  async.each( packages, function ( pkg, next ) {
    var dir       = path.join( location.moduleDir, location.modulePath, pkg.name )
      , jsonFile  = require( path.join( dir, 'package.json' ) )
      , deps      = [ ];

    jsonFile.dependencies     = jsonFile.dependencies     || {};
    jsonFile.devDependencies  = jsonFile.devDependencies  || {};

    Object.keys( jsonFile.dependencies ).forEach( function ( k ) {
      deps.push( k + '@' + jsonFile.dependencies[k] );
    } );

    Object.keys( jsonFile.devDependencies ).forEach( function ( k ) {
      deps.push( k + '@' + jsonFile.devDependencies[k] );
    } );

    utils.info( 'Installing dependencies for ' + pkg.name );

    async.each( deps, function ( dep, fn ) {
      var proc = spawn( 'npm', [ 'install', dep, '--prefix', location.moduleDir ], { cwd: dir } )
        , _err = '';

      proc.stderr.on( 'data', function ( data ) {
        _err += data + '';
      } );

      proc.on( 'close', function ( code ) {
        if (code !== 0) {
          return fn( _err );
        }

        fn( );
      } );
    }, next );
  },
  function ( err ) {
    if (!!err) {
      return def.reject( err );
    }

    utils.info( 'Finished installing dependencies' );
    def.resolve( );
  } );

  return def.promise;
}

/**
 * Installs NPM modules through tarball links
 *
 * @param  {Objects} location
 * @param  {Array} packages
 * @return {Promise}
 * @api public
 */

exports.installWithNpm = function ( location, packages ) {
  var def   = Promise.defer( );

  async.each( packages, function ( pkg, next ) {
    if (!pkg.hasOwnProperty( 'dist' ) || !pkg.dist.hasOwnProperty( 'tarball' )) {
      return next( );
    }

    get( pkg, pkg.dist.tarball, path.join( location.moduleDir, location.modulePath, pkg.name ) )
    .then( function ( ) {
      utils.success( 'Installed ' + pkg.name );
      next( );
    } )
    .catch( function ( err ) {
      next( err );
    } );
  }, function ( err ) {
    if (!!err) {
      return def.reject( err );
    }

    installNpmModules( location, packages )
    .then( function ( ) {
      def.resolve( );
    } )
    .catch( function ( err ) {
      def.reject( err );
    } );
  } );

  return def.promise;
}