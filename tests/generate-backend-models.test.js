var chai      = require( 'chai' )
  , expect    = chai.expect
  , exec      = require('child_process').exec
  , path      = require( 'path' )
  , rimraf    = require( 'rimraf' )
  , fs        = require( 'fs' )
  , binPath   = path.join( __dirname, '..', 'bin' )
  , assetPath = path.join( __dirname, 'assets' );

chai.Assertion.includeStack = true;

describe( 'Generate backend seed (models)', function ( ) {
  before( function ( done ) {
    rimraf( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2' ), function ( ) { done( ); } );
  } );

  after( function ( done ) {
    rimraf( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2' ), function ( ) { done( ); } );
  } );

  it( 'should be able to create', function ( done ) {
    exec( path.join( binPath, 'clever-generate' ) + ' model Testing2', { cwd: path.join( assetPath, 'my-new-project', 'backend', 'modules' ) }, function ( err, stdout, stderr ) {
      expect( stderr ).to.equal( '' );
      expect( stdout ).to.not.match( /already exists within/ );

      expect( fs.readdirSync( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2') ).length ).to.equal( 1 );
      expect( fs.existsSync( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2', 'models', 'odm', 'Testing2Model.js' ) ) ).to.be.true;
      expect( fs.existsSync( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2', 'models', 'odm', 'Testing2Model.js' ) ) ).to.be.true;

      var odmModel = fs.readFileSync( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2', 'models', 'odm', 'Testing2Model.js' ) );
      expect( odmModel ).to.match( /return mongoose\.model\('Testing2', ModelSchema\);/ );

      var ormModel = fs.readFileSync( path.join( assetPath, 'my-new-project', 'backend', 'modules', 'Testing2', 'models', 'orm', 'Testing2Model.js' ) );
      expect( ormModel ).to.match( /return sequelize.define\("Testing2", \{/ );

      done( err );
    } );
  } );

  it( 'should have trouble creating an existing model', function ( done ) {
    exec( path.join( binPath, 'clever-generate' ) + ' model Testing2', { cwd: path.join( assetPath, 'my-new-project', 'backend', 'modules' ) }, function ( err, stdout, stderr ) {
      expect( stderr ).to.equal( '' );
      expect( stdout ).to.match( /Testing2Model\.js already exists within/ );
      done( err );
    } );
  } );
} );
